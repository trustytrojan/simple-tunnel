import net from 'node:net';
import process from 'node:process';
import { parseArgs } from 'jsr:@std/cli';

// --- Configuration ---
const args = parseArgs(Deno.args);

const TUNNEL_SERVER_HOST = args['tunnel-server-host'];
const AGENT_CONTROL_PORT = args['agent-control-port'];
const AGENT_DATA_PORT = args['agent-data-port'];
const DESTINATIONS_RAW = args['destinations']; // JSON string like '{"service1":"localhost:8080", "service2":"localhost:8081"}'

if (!TUNNEL_SERVER_HOST || !AGENT_CONTROL_PORT || !AGENT_DATA_PORT || !DESTINATIONS_RAW) {
	console.error(
		'All arguments must be specified: --tunnel-server-host, --agent-control-port, --agent-data-port, --destinations (as JSON)',
	);
	process.exit(1);
}

let destinations: Record<string, string>;
try {
	destinations = JSON.parse(DESTINATIONS_RAW);
} catch (e) {
	console.error('Error parsing --destinations JSON:', (e as Error).message);
	process.exit(1);
}

const controlSocket = net.connect(AGENT_CONTROL_PORT, TUNNEL_SERVER_HOST, () => {
	console.log('Connected to tunnel server control port.');
	// Send destinations to server
	controlSocket.write(JSON.stringify(destinations));
});

controlSocket.on('data', (data) => {
	const message = data.toString().trim();
	if (!message.startsWith('new-tunnel:'))
		return;

	const alias = message.substring('new-tunnel:'.length);
	const destination = destinations[alias];

	if (!destination) {
		console.error(`Received request for unknown alias: ${alias}`);
		return;
	}

	console.log(`Received request for new tunnel for alias '${alias}' -> '${destination}'`);

	const dataSocket = net.connect(AGENT_DATA_PORT, TUNNEL_SERVER_HOST, () => {
		console.log('Connected to tunnel server data port.');
		// Identify this data connection is for the alias
		dataSocket.write(alias);

		const [destHost, destPort] = destination.split(':');
		console.debug(`destination='${destination}' destHost='${destHost}' destPort='${destPort}'`);
		const destSocket = net.connect(parseInt(destPort, 10), destHost, () => {
			console.log(`Connected to destination for alias '${alias}' at ${destination}.`);
			dataSocket.pipe(destSocket);
			destSocket.pipe(dataSocket);
		});

		destSocket.on('error', (err) => {
			console.error(`Destination server connection error for alias '${alias}':`, err);
			dataSocket.destroy();
		});
	});

	dataSocket.on('error', (err) => {
		console.error(`Tunnel server data connection error for alias '${alias}':`, err);
	});
});

controlSocket.on('error', (err) => {
	console.error('Control connection error:', err);
});

controlSocket.on('close', () => {
	console.log('Control connection to tunnel server closed.');
	process.exit(0);
});
