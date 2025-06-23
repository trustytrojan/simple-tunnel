# Simple TCP Tunnel
This project provides a simple TCP tunneling service that allows you to expose multiple backend services running on a private network (behind an "agent") to the public internet through a single tunnel server. This basically reverse engineers tunneling services like [Playit.gg](https://playit.gg), allowing you to host your own tunnel servers without IP/port restrictions.

## Limitations
- As of right now, the tunnel server can only handle one agent. If I ever need multiple agents, then I'll implement the functionality.
- TCP only, TODO: implement UDP tunneling
- Make a Dockerfile for the agent program (very low priority)

## How it Works
The system consists of two main components:

1.  **[`tunserv.ts`](src/tunserv.ts) (Tunnel Server):** This server runs on a publicly accessible machine. It listens for connections from a single agent and multiple clients. It's responsible for mapping incoming client connections on specific ports to the correct backend service on the agent's network.

2.  **[`agent.ts`](src/agent.ts) (Agent):** This runs on a machine within a private network. It establishes a control connection to the tunnel server and, based on requests from the server, creates data tunnels to forward traffic to different local services.

The mapping between the public-facing ports on the tunnel server and the backend services on the agent's network is defined by two corresponding JSON configurations.

## Configuration
Configuration is provided via command-line arguments, with some arguments accepting JSON files for more complex configurations.

### [`tunserv.ts`](src/tunserv.ts) Arguments
-   `--agent-control-port`: The port on which the tunnel server listens for the agent's control connection.
-   `--agent-data-port`: The port on which the tunnel server listens for the agent's data connections.
-   `--client-ports`: **(Required)** A path to a JSON file that defines the mapping between the public-facing client ports and service aliases. The keys are the port numbers the tunnel server will listen on, and the values are string aliases for the backend services.

    *Example [`tunserv-aliases.json`](example/tunserv-aliases.json) (`--client-ports` argument):*
    ```json
    {
        "9090": "webserver1",
        "9091": "webserver2"
    }
    ```

### [`agent.ts`](src/agent.ts) Arguments
-   `--tunnel-server-host`: The hostname or IP address of the tunnel server.
-   `--agent-control-port`: The port for the control connection on the tunnel server.
-   `--agent-data-port`: The port for data connections on the tunnel server.
-   `--destinations`: **(Required)** A path to a JSON file that maps the service aliases to the actual `host:port` of the backend services on the agent's local network.

    *Example [`agent-destinations.json`](example/agent-destinations.json) (`--destinations` argument):*
    ```json
    {
        "webserver1": "localhost:8080",
        "webserver2": "localhost:8081"
    }
    ```

### The Connection Between Configurations
The [`tunserv-aliases.json`](example/tunserv-aliases.json) and [`agent-destinations.json`](example/agent-destinations.json) files work together as two connected dictionaries to establish the tunnel mappings.

-   The **values** in [`tunserv-aliases.json`](example/tunserv-aliases.json) (e.g., `"webserver1"`) are service aliases.
-   These aliases must match the **keys** in [`agent-destinations.json`](example/agent-destinations.json).

This creates the following mapping:

-   A client connecting to port `9090` on the tunnel server is associated with the alias `webserver1`.
-   The tunnel server tells the agent to create a tunnel for `webserver1`.
-   The agent looks up `webserver1` in its destinations file and forwards the traffic to `localhost:8080`.

Essentially, the aliases act as a shared key to link a public port to a private service.
