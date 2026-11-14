# PROTOTYPE — Buzzline on PDFs (throwaway; see NOTES.md).
# Build from the repo root (the viewer runs the extension's own src/):
#   docker build -f prototype/pdf-viewer/Dockerfile -t buzzline-pdf-prototype .
#   docker run --rm -p 8791:8791 buzzline-pdf-prototype
#   open http://127.0.0.1:8791/
FROM node:22-alpine
WORKDIR /app

# pdf.js, pinned (keep in step with PDFJS_VERSION in serve.js); baked into the
# image so the viewer loads no remote scripts.
ARG PDFJS_VERSION=4.10.38
RUN mkdir -p prototype/pdf-viewer/vendor && cd prototype/pdf-viewer/vendor && \
    for f in pdf.min.mjs pdf.worker.min.mjs; do wget -q "https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/$f" || exit 1; done

COPY manifest.json ./
COPY src ./src
COPY prototype/pdf-viewer ./prototype/pdf-viewer

ENV HOST=0.0.0.0 PORT=8791
EXPOSE 8791
USER node
CMD ["node", "prototype/pdf-viewer/serve.js"]
