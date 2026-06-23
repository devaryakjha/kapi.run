const targets = {
  "app.kapi.run": "app-kapi.jha.sh",
  "api.kapi.run": "api-kapi.jha.sh",
};

export default {
  fetch(request) {
    const url = new URL(request.url);
    const target = targets[url.hostname];

    if (!target) {
      return new Response("Not found", { status: 404 });
    }

    url.hostname = target;
    return fetch(new Request(url, request));
  },
};
