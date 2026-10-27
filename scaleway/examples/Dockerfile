FROM gcr.io/distroless/nodejs22-debian12
WORKDIR /app
COPY scw-env.mjs /opt/scw-env.mjs
COPY print-env.mjs .
USER nonroot
ENTRYPOINT ["/nodejs/bin/node", "--import", "/opt/scw-env.mjs"]
CMD ["print-env.mjs"]
