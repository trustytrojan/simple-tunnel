import net from 'node:net';
import process from 'node:process';
import { parseArgs } from 'jsr:@std/cli';

// --- Configuration ---
const args = parseArgs(Deno.args);

const TUNNEL_SERVER_HOST = args['tunnel-server-host'];
const AGENT_CONTROL_PORT = args['agent-control-port'];
const AGENT_DATA_PORT = args['agent-data-port'];
const DESTINATION_HOST = args['destination-host'];
const DESTINATION_PORT = args['destination-port'];

if (!TUNNEL_SERVER_HOST || !AGENT_CONTROL_PORT || !AGENT_DATA_PORT || !DESTINATION_HOST || !DESTINATION_PORT) {
    console.error("All arguments must be specified: --tunnel-server-host, --agent-control-port, --agent-data-port, --destination-host, --destination-port");
    process.exit(1);
}

const controlSocket = net.connect(AGENT_CONTROL_PORT, TUNNEL_SERVER_HOST, () => {
    console.log('Connected to tunnel server control port.');
});

controlSocket.on('data', (data) => {
    if (data.toString().trim() === 'new-tunnel') {
        console.log('Received request for new tunnel.');
        
		const dataSocket = net.connect(AGENT_DATA_PORT, TUNNEL_SERVER_HOST, () => {
            console.log('Connected to tunnel server data port.');
            
			const destSocket = net.connect(DESTINATION_PORT, DESTINATION_HOST, () => {
                console.log('Connected to destination server.');
                dataSocket.pipe(destSocket);
                destSocket.pipe(dataSocket);
            });

            destSocket.on('error', (err) => {
                console.error('Destination server connection error:', err);
                dataSocket.destroy();
            });
        });

        dataSocket.on('error', (err) => {
            console.error('Tunnel server data connection error:', err);
        });
    }
});

controlSocket.on('error', (err) => {
    console.error('Control connection error:', err);
});

controlSocket.on('close', () => {
    console.log('Control connection to tunnel server closed.');
    process.exit(0);
});
