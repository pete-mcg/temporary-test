FROM node:20-alpine AS frontend  
RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app

ARG VITE_BUILD_NUMBER=00
ARG VITE_APP_VERSION=dev
ARG VITE_ENVIRONMENT=Development
ENV VITE_BUILD_NUMBER=$VITE_BUILD_NUMBER
ENV VITE_APP_VERSION=$VITE_APP_VERSION
ENV VITE_ENVIRONMENT=$VITE_ENVIRONMENT

WORKDIR /home/node/app 
COPY ./frontend/package*.json ./  
USER node
RUN npm ci  
COPY --chown=node:node ./frontend/ ./frontend  
COPY --chown=node:node ./static/ ./static  
WORKDIR /home/node/app/frontend
RUN npm run build
  
FROM python:3.11-alpine 
RUN apk add --no-cache --virtual .build-deps \  
    build-base \  
    libffi-dev \  
    openssl-dev \  
    curl \  
    && apk add --no-cache \  
    libpq 
  
COPY requirements.txt /usr/src/app/  
RUN pip install --no-cache-dir -r /usr/src/app/requirements.txt \  
    && rm -rf /root/.cache  
  
COPY . /usr/src/app/  
COPY --from=frontend /home/node/app/static  /usr/src/app/static/
WORKDIR /usr/src/app  
EXPOSE 80  

CMD ["gunicorn"  , "-b", "0.0.0.0:80", "app:app"]