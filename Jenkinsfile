pipeline {
    agent any

    environment {
        REPO_URL        = 'https://github.com/nalpari/qpartners-neo.git'
        BRANCH          = 'development'
        APP_NAME        = 'qpartners-neo'
        APP_ENV         = 'development'
        APP_PORT        = '5010'
        APP_ROOT        = "/home/interplug/qpartners/${APP_ENV}"
        IMAGE_TAG       = "${env.BUILD_NUMBER}"
        COMPOSE_FILE    = 'docker-compose.yml'
        // Jenkins > Credentials 에서 등록한 ID
        GIT_CREDENTIALS = 'github-app-credential'
        ENV_CREDENTIALS = 'dev-env'
    }

    options {
        timestamps()
        timeout(time: 30, unit: 'MINUTES')
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    triggers {
        // 매일 08시, 12시, 17시에 SCM 폴링 → 새 커밋 존재 시에만 빌드
        pollSCM('0 8,12,17 * * *')
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

        stage('Prepare Env') {
            steps {
                // 이전 빌드에서 남은 env 파일 제거 (root 소유 파일 대비)
                sh "rm -f .env.${APP_ENV}"
                // Jenkins Credentials에서 .env 파일 복사
                withCredentials([file(credentialsId: "${ENV_CREDENTIALS}", variable: 'ENV_FILE')]) {
                    sh "cp \$ENV_FILE .env.${APP_ENV}"
                }
            }
        }

        stage('Docker Build') {
            steps {
                sh """
                    docker build \
                        -t ${APP_NAME}:${IMAGE_TAG} \
                        -t ${APP_NAME}:latest \
                        --build-arg PORT=${APP_PORT} \
                        .
                """
            }
        }

        stage('Stop Existing') {
            steps {
                sh """
                    APP_PORT=${APP_PORT} \
                    APP_ENV=${APP_ENV} \
                    APP_ROOT=${APP_ROOT} \
                    IMAGE_TAG=${IMAGE_TAG} \
                    docker compose -f ${COMPOSE_FILE} down --remove-orphans || true
                """
            }
        }

        stage('Deploy') {
            steps {
                sh """
                    IMAGE_TAG=${IMAGE_TAG} \
                    APP_PORT=${APP_PORT} \
                    APP_ENV=${APP_ENV} \
                    APP_ROOT=${APP_ROOT} \
                    docker compose -f ${COMPOSE_FILE} up -d
                """
            }
        }

        stage('Health Check') {
            steps {
                script {
                    sleep(time: 10, unit: 'SECONDS')
                    sh """
                        APP_PORT=${APP_PORT} \
                        APP_ENV=${APP_ENV} \
                        APP_ROOT=${APP_ROOT} \
                        IMAGE_TAG=${IMAGE_TAG} \
                        docker compose -f ${COMPOSE_FILE} ps
                    """
                }
            }
        }
    }

    post {
        success {
            echo "Build #${BUILD_NUMBER} 배포 성공 (commit: ${env.GIT_COMMIT_SHORT})"
            // 오래된 이미지 정리 (최근 3개만 유지)
            sh """
                docker images ${APP_NAME} --format '{{.Tag}}' | \
                grep -v latest | sort -rn | tail -n +4 | \
                xargs -I {} docker rmi ${APP_NAME}:{} || true
            """
            // 디스크 공간 확보: 24시간 지난 빌드 캐시 정리 (당일 캐시는 재사용 위해 보존)
            sh 'docker builder prune -f --filter "until=24h" || true'
        }
        failure {
            echo "Build #${BUILD_NUMBER} 실패 - 롤백 검토 필요"
            sh """
                APP_PORT=${APP_PORT} \
                APP_ENV=${APP_ENV} \
                APP_ROOT=${APP_ROOT} \
                IMAGE_TAG=${IMAGE_TAG} \
                docker compose -f ${COMPOSE_FILE} logs --tail=100 || true
            """
        }
        always {
            sh 'docker image prune -f || true'
        }
    }
}
