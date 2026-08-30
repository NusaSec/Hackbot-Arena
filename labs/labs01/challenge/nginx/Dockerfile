FROM nginx:1.27-alpine

RUN mkdir -p /var/cache/nginx/ctf && \
    chown -R nginx:nginx /var/cache/nginx

COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
