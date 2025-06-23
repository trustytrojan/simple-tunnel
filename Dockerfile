FROM denoland/deno:2.3.6
EXPOSE 9000 9001
# don't forget to expose the alias ports with -p
WORKDIR /app
COPY src/tunserv.ts .
USER deno
RUN deno cache tunserv.ts
ENTRYPOINT ["/bin/deno", "--allow-net", "tunserv.ts"]