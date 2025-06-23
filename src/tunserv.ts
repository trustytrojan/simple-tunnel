import net from 'node:net';
import { parseArgs } from 'jsr:@std/cli';

// --- Configuration ---
const args = parseArgs(Deno.args);

const AGENT_CONTROL_PORT = args['agent-control-port'];
const CLIENT_PORTS_RAW = args['client-ports'];
const AGENT_DATA_PORT = args['agent-data-port'];

const addrstr = (sock: net.Socket) => `${sock.remoteAddress}:${sock.remotePort}`;

if (!AGENT_CONTROL_PORT || !CLIENT_PORTS_RAW || !AGENT_DATA_PORT) {
	console.error(
		'All arguments must be specified: --agent-control-port, --client-ports (as JSON), --agent-data-port',
	);
	Deno.exit(1);
}

let clientPorts: Record<string, string>;
try {
	clientPorts = JSON.parse(CLIENT_PORTS_RAW);
} catch (e) {
	console.error('Error parsing --client-ports JSON:', (e as Error).message);
	Deno.exit(1);
}

let agentControlSocket: net.Socket | null = null;
let agentDestinations: Record<string, string> | null = null;
const waitingClients: Map<string, net.Socket[]> = new Map();

// --- Agent Control Server ---
// Waits for a single agent to connect and establish a control channel.
const agentControlServer = net.createServer((socket) => {
	if (agentControlSocket) {
		console.log('Agent already connected. Rejecting new connection.');
		socket.destroy();
		return;
	}

	console.log('Agent connected:', addrstr(socket));
	agentControlSocket = socket;
	agentControlServer.close(); // Stop accepting new agent connections

	agentControlSocket.once('data', (data) => {
		try {
			agentDestinations = JSON.parse(data.toString());
			console.log('Received agent destinations:', agentDestinations);
		} catch (e) {
			console.error('Error parsing agent destinations:', (e as Error).message);
			agentControlSocket?.destroy();
		}
	});

	agentControlSocket.on('error', (err) => {
		console.error('Agent control socket error:', err);
		agentControlSocket = null;
	});

	agentControlSocket.on('close', () => {
		console.log('Agent disconnected.');
		agentControlSocket = null;
		agentDestinations = null;

		// On agent disconnect, close the data server and any waiting clients.
		agentDataServer.close();
		waitingClients.forEach((clients) => clients.forEach((client) => client.destroy()));
		console.log('Cleaned up resources.');

		// Restart listening for a new agent
		agentControlServer.listen(AGENT_CONTROL_PORT, () => {
			console.log(`Tunnel server waiting for agent on port ${AGENT_CONTROL_PORT}`);
		});
	});
});

// --- Agent Data Server ---
// Listens for data connections from the agent.
const agentDataServer = net.createServer((agentDataSocket) => {
	agentDataSocket.once('data', (data) => {
		const alias = data.toString().trim();
		const clientSocket = waitingClients.get(alias)?.shift();

		if (!clientSocket) {
			console.log(`Agent data connection for alias '${alias}' received, but no waiting client. Closing.`);
			agentDataSocket.destroy();
			return;
		}

		console.log(`Pairing client for alias '${alias}' with agent data connection to create tunnel.`);
		clientSocket.pipe(agentDataSocket);
		agentDataSocket.pipe(clientSocket);

		// Setup cleanup handlers
		agentDataSocket.on('close', () => clientSocket.destroy());
		clientSocket.on('close', () => agentDataSocket.destroy());
		agentDataSocket.on('error', (err) => {
			console.error('Error from agent data socket:', err);
			clientSocket.destroy();
		});
		clientSocket.on('error', (err) => {
			console.error('Error from client socket:', err);
			agentDataSocket.destroy();
		});
	});
});

// --- Client Servers ---
for (const portStr in clientPorts) {
	const port = parseInt(portStr, 10);
	const alias = clientPorts[portStr];
	waitingClients.set(alias, []);

	const clientServer = net.createServer((clientSocket) => {
		if (!agentControlSocket || !agentDestinations) {
			console.log(`Client ${clientSocket.remoteAddress}: connected to port ${port}, but no agent is available. Rejecting.`);
			clientSocket.destroy();
			return;
		}

		if (!agentDestinations[alias]) {
			console.log(`Client connected for alias '${alias}', but agent does not support it. Rejecting.`);
			clientSocket.destroy();
			return;
		}

		console.log(`Client connected for alias '${alias}'. Adding to waiting queue and requesting new tunnel from agent.`);
		waitingClients.get(alias)?.push(clientSocket);
		agentControlSocket.write(`new-tunnel:${alias}`);
	});

	clientServer.listen(port, () => {
		console.log(`Tunnel server listening for clients for alias '${alias}' on port ${port}`);
	});
}

// --- Start Servers ---
agentControlServer.listen(AGENT_CONTROL_PORT, () => {
	console.log(`Tunnel server waiting for agent on port ${AGENT_CONTROL_PORT}`);
});

agentDataServer.listen(AGENT_DATA_PORT, () => {
	console.log(`Tunnel server listening for agent data connections on port ${AGENT_DATA_PORT}`);
});
