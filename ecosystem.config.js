const prodRoot = process.env.APP_ROOT_PRODUCTION;
if (!prodRoot && process.env.NODE_ENV === "production") {
    console.error("[ecosystem] APP_ROOT_PRODUCTION 환경변수가 설정되지 않았습니다.");
}

module.exports = {
    apps: [
        {
            name: "qpartners-neo-dev",
            script: "node_modules/next/dist/bin/next",
            args: "dev --webpack -p 5010",
            cwd: process.env.APP_ROOT_DEVELOPMENT || __dirname,
            env: {
                NODE_ENV: "development",
            },
        },
        {
            name: "qpartners-neo-prod-1",
            script: "node_modules/next/dist/bin/next",
            args: "start -p 5000",
            cwd: prodRoot || __dirname,
            env: {
                NODE_ENV: "production",
            },
        },
        {
            name: "qpartners-neo-prod-2",
            script: "node_modules/next/dist/bin/next",
            args: "start -p 5001",
            cwd: prodRoot || __dirname,
            env: {
                NODE_ENV: "production",
            },
        },
    ],
};
