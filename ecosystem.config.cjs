module.exports = {
  apps: [{
    name: "trabot",
    script: "server.js",
    env: {
      NODE_ENV: "production",
      PORT: 5000
    },
    watch: false,
    ignore_watch: ["node_modules", "bot-state.json"]
  }]
}
