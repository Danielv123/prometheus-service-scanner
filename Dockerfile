FROM node
LABEL maintainer "danielv@danielv.no"
ADD . /
RUN npm install
EXPOSE 3000
WORKDIR /src
ENTRYPOINT ["node"]
CMD ["index.js"]
