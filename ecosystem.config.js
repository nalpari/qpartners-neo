module.exports = {
    apps: [
        {
            name: "qpartners-neo-dev",
            script: "node_modules/next/dist/bin/next",
            args: "dev -p 5010",
            cwd: "/home/development/apps/qpartners-neo",
            env: {
                NODE_ENV: "development",
            },
        },
        {
            name: "qpartners-neo-prod-1",
            script: "node_modules/next/dist/bin/next",
            args: "start -p 5000",
            cwd: "/home/production/apps/qpartners-neo",
            env: {
                NODE_ENV: "production",
            },
        },
        {
            name: "qpartners-neo-prod-2",
            script: "node_modules/next/dist/bin/next",
            args: "start -p 5001",
            cwd: "/home/production/apps/qpartners-neo",
            env: {
                NODE_ENV: "production",
            },
        },
    ],
};