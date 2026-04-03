module.exports = {
    apps: [
        {
            name: "qpartners-neo-dev",
            script: "node_modules/next/dist/bin/next",
            args: "dev --webpack -p 5010",
            cwd: process.env.APP_ROOT_DEVELOPMENT || process.cwd(),
            env: {
                NODE_ENV: "development",
            },
        },
        {
            name: "qpartners-neo-prod-1",
            script: "node_modules/next/dist/bin/next",
            args: "start -p 5000",
            cwd: process.env.APP_ROOT_PRODUCTION || process.cwd(),
            env: {
                NODE_ENV: "production",
            },
        },
        {
            name: "qpartners-neo-prod-2",
            script: "node_modules/next/dist/bin/next",
            args: "start -p 5001",
            cwd: process.env.APP_ROOT_PRODUCTION || process.cwd(),
            env: {
                NODE_ENV: "production",
            },
        },
    ],
};
