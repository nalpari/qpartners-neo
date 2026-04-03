module.exports = {
    apps: [
        {
            name: "qpartners-neo-dev",
            script: "node_modules/.bin/next",
            args: "dev -p 5010",
            cwd: "/path/to/qpartners-neo",
            env: {
                NODE_ENV: "development",
            },
        },
        {
            name: "qpartners-neo-prod-1",
            script: "node_modules/.bin/next",
            args: "start -p 5000",
            cwd: "/path/to/qpartners-neo",
            env: {
                NODE_ENV: "production",
            },
        },
        {
            name: "qpartners-neo-prod-2",
            script: "node_modules/.bin/next",
            args: "start -p 5001",
            cwd: "/path/to/qpartners-neo",
            env: {
                NODE_ENV: "production",
            },
        },
    ],
};