# The updater container: Docker's CLI and Compose, plus what `osmcp` needs.
# Built on the server by install.sh; the scripts it runs are mounted from the
# install directory, so a release updates them without rebuilding this.
FROM docker:29-cli
RUN apk add --no-cache bash curl
