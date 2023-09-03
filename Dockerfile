FROM node:lts-alpine
ENV PORT=8123
WORKDIR /app
COPY ["package.json", "tsconfig.json", "yarn.lock", "./"]
COPY src ./src
RUN yarn install && yarn build && rm -rf ./node_modules
ENV NODE_ENV=production
RUN yarn install --production
RUN mkdir /app/db
EXPOSE 8123
RUN chown -R node /app
USER node
CMD ["yarn", "start"]