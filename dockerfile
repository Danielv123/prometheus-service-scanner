FROM node:10
MAINTAINER Danielv123
ADD . /
RUN npm install
EXPOSE 80
WORKDIR /src
ENTRYPOINT ["node"]
CMD ["index.js"]
