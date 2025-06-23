#!/bin/bash
set -e

# Tunnel server
deno --allow-net ../src/tunserv.ts \
	--agent-control-port 9000 \
	--agent-data-port 9001 \
	--client-ports "$(<tunserv-aliases.json)" \
	&>tunserv.log & TUNSERV_PID=$!
sleep 0.1

# Agent
deno --allow-net ../src/agent.ts \
	--tunnel-server-host '' \
	--agent-control-port 9000 \
	--agent-data-port 9001 \
	--destinations "$(<agent-destinations.json)" \
	&>agent.log & AGENT_PID=$!
sleep 0.1

# Webservers
cd dir1
python -m http.server 8080 &>../webserver1.log & WEBSERVER1_PID=$!
sleep 0.1
cd ../dir2
python -m http.server 8081 &>../webserver2.log & WEBSERVER2_PID=$!
sleep 0.1
cd ..

# Client requests
echo 'Requesting webserver 1...'
curl http://localhost:8080 && echo
sleep 0.1
echo 'Requesting webserver 2...'
curl http://localhost:8081
sleep 0.1

# Check webserver1.log and webserver2.log to see that the requests went through!

kill $TUNSERV_PID $AGENT_PID $WEBSERVER1_PID $WEBSERVER2_PID
