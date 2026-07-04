FROM node:alpine as builder

COPY . /app
WORKDIR /app
RUN apk add --no-cache git && npm install && npm run radicale


FROM alpine:3.19

RUN apk add --no-cache \
    radicale py3-six\
  && rm -rf /var/cache/apk/* \
  \
  && { \
    echo '[allow-all]'; \
    echo 'user: .+'; \
    echo 'collection: .*'; \
    echo 'permissions: rRwW'; \
  } > /etc/radicale/rights \
  \
  && { \
    echo '[server]'; \
    echo 'hosts = 0.0.0.0:5232, [::]:5232'; \
    echo; \
    echo '[auth]'; \
    echo 'type = http_x_remote_user'; \
    echo; \
    echo '[web]'; \
    echo 'type = none'; \
    echo; \
    echo '[storage]'; \
    echo 'type = multifilesystem'; \
    echo 'filesystem_folder = /app/vcards'; \
    echo; \
    echo '[rights]'; \
    echo 'type = from_file'; \
    echo 'file = /etc/radicale/rights'; \
  } > /etc/radicale/config

EXPOSE 5232

CMD ["radicale"]
