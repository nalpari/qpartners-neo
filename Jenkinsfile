pipeline {
    agent any

    environment {
        REPO_URL       = 'https://github.com/nalpari/qpartners-neo.git'
        BRANCH         = 'development'
        APP_NAME       = 'qpartners-neo'
        IMAGE_TAG      = "${env.BUILD_NUMBER}"
        COMPOSE_FILE   = 'docker-compose.yml'
        // GitHub credentials ID (Jenkins > Credentials 에서 등록한 ID)
        GIT_CREDENTIALS = 'github-app-credential'
    }

    options {
        timestamps()
        timeout(time: 30, unit: 'MINUTES')
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    stages {
        stage('Checkout') {
            steps {
                git branch: "${BRANCH}",
                    credentialsId: "${GIT_CREDENTIALS}",
                    url: "${REPO_URL}"

                script {
                    env.GIT_COMMIT_SHORT = sh(
                        script: 'git rev-parse --short HEAD',
                        returnStdout: true
                    ).trim()
                }
                echo "Checked out commit: ${env.GIT_COMMIT_SHORT}"
            }
        }

        stage('Docker Build') {
            steps {
                sh """
                    docker build \\
                        -t ${APP_NAME}:${IMAGE_TAG} \\
                        -t ${APP_NAME}:latest \\
                        --build-arg GIT_COMMIT=${env.GIT_COMMIT_SHORT} \\
                        .
                """
            }
        }

        stage('Stop Existing Containers') {
            steps {
                sh """
                    docker compose -f ${COMPOSE_FILE} down --remove-orphans || true
                """
            }
        }

        stage('Deploy with Docker Compose') {
            steps {
                sh """
                    IMAGE_TAG=${IMAGE_TAG} docker compose -f ${COMPOSE_FILE} up -d
                """
            }
        }

        stage('Health Check') {
            steps {
                script {
                    sleep(time: 10, unit: 'SECONDS')
                    sh "docker compose -f ${COMPOSE_FILE} ps"
                }
            }
        }
    }

    post {
        success {
            echo "✅ Build #${BUILD_NUMBER} 배포 성공 (commit: ${env.GIT_COMMIT_SHORT})"
            // 오래된 이미지 정리 (최근 3개만 유지)
            sh """
                docker images ${APP_NAME} --format '{{.Tag}}' | \\
                grep -v latest | sort -rn | tail -n +4 | \\
                xargs -I {} docker rmi ${APP_NAME}:{} || true
            """
        }
        failure {
            echo "❌ Build #${BUILD_NUMBER} 실패 - 롤백 검토 필요"
            sh "docker compose -f ${COMPOSE_FILE} logs --tail=100 || true"
        }
        always {
            sh 'docker image prune -f || true'
        }
    }
}