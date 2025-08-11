# Use an official Node.js runtime as a parent image
FROM node:20-slim

# Install git, curl, GitHub CLI, pgrep, and sudo
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
    dirmngr \
    sudo \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | gpg --dearmor -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod a+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
    git \
    gh \
    procps \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory in the container
WORKDIR /app

# Change ownership of the working directory
RUN chown node:node /app

# Add node user to sudoers with no password
RUN echo 'node ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/node && chmod 0440 /etc/sudoers.d/node

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Change ownership after copying files
RUN chown node:node /app/package*.json || true

# Switch to non-root user for install/build/prune
USER node

# Install project dependencies
RUN npm install

# Copy the rest of the application's source code (as node)
COPY --chown=node:node . .

# Build the TypeScript code
RUN npm run build

# Prune development dependencies
RUN npm prune --production


# Expose the port the app runs on
EXPOSE 3000

# Define the command to run the application
CMD ["npm", "start"]
