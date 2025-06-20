import net from 'node:net';
import { parseArgs } from 'jsr:@std/cli';

// --- Configuration ---
const args = parseArgs(Deno.args);

const AGENT_CONTROL_PORT = args['agent-control-port'];
const CLIENT_PORT = args['client-port'];
const AGENT_DATA_PORT = args['agent-data-port'];

if (!AGENT_CONTROL_PORT || !CLIENT_PORT || !AGENT_DATA_PORT) {
    console.error("All ports must be specified: --agent-control-port, --client-port, --agent-data-port");
    Deno.exit(1);
}

let agentControlSocket: net.Socket | null = null;
const waitingClients: net.Socket[] = [];

// --- Agent Control Server ---
// Waits for a single agent to connect and establish a control channel.
const agentControlServer = net.createServer(socket => {
    if (agentControlSocket) {
        console.log('Agent already connected. Rejecting new connection.');
        socket.destroy();
        return;
    }
    console.log('Agent connected.');
    agentControlSocket = socket;
    agentControlServer.close(); // Stop accepting new agent connections

    agentControlSocket.on('error', (err) => {
        console.error('Agent control socket error:', err);
        agentControlSocket = null;
    });
    agentControlSocket.on('close', () => {
        console.log('Agent disconnected.');
        agentControlSocket = null;
        // On agent disconnect, close the data server and any waiting clients.
        agentDataServer.close();
        waitingClients.forEach(client => client.destroy());
        console.log('Cleaned up resources.');
        // Restart listening for a new agent
        agentControlServer.listen(AGENT_CONTROL_PORT, () => {
            console.log(`Tunnel server waiting for agent on port ${AGENT_CONTROL_PORT}`);
        });
    });
});

// --- Agent Data Server ---
// Listens for data connections from the agent.
const agentDataServer = net.createServer(agentDataSocket => {
    const clientSocket = waitingClients.shift();
    if (!clientSocket) {
        console.log('Agent data connection received, but no waiting client. Closing.');
        agentDataSocket.destroy();
        return;
    }

    console.log('Pairing client with agent data connection to create tunnel.');
    clientSocket.pipe(agentDataSocket);
    agentDataSocket.pipe(clientSocket);

    // Setup cleanup handlers
    agentDataSocket.on('close', () => clientSocket.destroy());
    clientSocket.on('close', () => agentDataSocket.destroy());
    agentDataSocket.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => agentDataSocket.destroy());
});

// --- Client Server ---
// Listens for end-user clients.
const clientServer = net.createServer(clientSocket => {
    if (!agentControlSocket) {
        console.log('Client connected, but no agent is available. Rejecting.');
        clientSocket.destroy();
        return;
    }
    console.log('Client connected. Adding to waiting queue and requesting new tunnel from agent.');
    waitingClients.push(clientSocket);
    agentControlSocket.write('new-tunnel\n');
});

// --- Start Servers ---
agentControlServer.listen(AGENT_CONTROL_PORT, () => {
    console.log(`Tunnel server waiting for agent on port ${AGENT_CONTROL_PORT}`);
});

agentDataServer.listen(AGENT_DATA_PORT, () => {
    console.log(`Tunnel server listening for agent data connections on port ${AGENT_DATA_PORT}`);
});

clientServer.listen(CLIENT_PORT, () => {
    console.log(`Tunnel server listening for clients on port ${CLIENT_PORT}`);
});
