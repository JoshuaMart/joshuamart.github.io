---
title: "My bounty infrastructure"
date: 2021-05-21T06:00:00+01:00
description: My bounty infrastructure
---

![](banner.png)

[31/12/2020] : Updated the post for Rengine to v0.5 and a clearer / cleaner configuration of Traefik as well as the removal of Portainer.

After some problems with Rengine for certificate management and a new service that I want to use, I switched to a full docker infrastructure on my server, apart from the use of a few containers it's my first experience with Docker but after some difficulties I find it rather practical and modular.

So I'm sharing with you today the installation of my bounty infrastructure

## Objective

The following services will be installed on your server :

 - [Traefik](https://docs.traefik.io/) : Container docker of reverse proxy, it will take care of redirecting web traffic to our different containers and it will also manage our SSL certificates via let's encrypt.
 - [XSS-Catcher](https://github.com/daxAKAhackerman/XSS-Catcher) : Container docker for XSS blinds.
 - [PHP & Apache](https://hub.docker.com/_/php) : Container docker PHP / Apache to host files for our different pocs. I use for example a php file to make redictions when I have a SSRF (cf : [Exploiting my first SSRF](https://www.jomar.fr/posts/2020/03/en-exploiting-my-first-ssrf/)).
 - [Rengine](https://github.com/yogeshojha/rengine/): Container docker for subdomain recognition. The v0.5 is really incredible with the addition of [Nuclei](https://github.com/projectdiscovery/nuclei)
 - [WebHook](https://github.com/fredsted/webhook.site) : Container docker for use, test and debug Webhooks and HTTP requests

![bnty_docker_schema](bnty_docker_schema.png)

## Prerequisites
- A Ubuntu 20.04 LTS server with at least 4GB of RAM
	- 2GB can be enough if you just do small scans with Rengine, the more you run concurrent scans on domains with many subdomains, the more resources it will consume, logic ...
- One domain
	- The following DNS entries filled in with :
      - `traefik.your_domain.tld IN A {your_server_ip}`
	  - `poc.your_domain.tld IN CNAME traefik.your_domain.tld`
	  - `xss.your_domain.tld IN CNAME traefik.your_domain.tld`
	  - `recon.your_domain.tld IN CNAME traefik.your_domain.tld`
      - `webhook.your_domain.tld IN CNAME traefik.your_domain.tld `
	  - `your_domain.tld CAA 128 issue "letsencrypt.org"`

## Disclaimer
This is my first installation using Docker, so it's quite likely that it can be upgraded. Feel free to let me know if you can advise me. Moreover, I don't provide support for Docker/Rengine installation/debug, if however you notice an error in my script or if an item is out of date, don't hesitate to tell me.

## Easy install

Download [this script](https://jomar.s3.fr-par.scw.cloud/Public/tuto.sh), modify the two variables `domain` and `email` and run it, it will take care of installing docker and getting the necessary configurations.

Then perform the following commands:
```
cd Traefik && docker-compose up -d
cd ../ && cd Poc && docker-compose up -d
cd ../ && cd XSS-Catcher && docker-compose up -d
cd ../ && cd Rengine && docker-compose up -d
cd ../ && cd Webhook && docker-compose up -d
```
All of your containers should now be started.

## Configuration of each of the containers
### Traefik
With the new proposed configuration of 24/12/2020, it will first be necessary to change the IP address by yours in the file `Traefik/dynamic/middlewares.toml`.
You can add one or more IP address with the corresponding mask, to recall /32 for a single IP. This middleware is actually used to add IP protection on some of your containers, so they will only be accessible to people with an authorized IP address.

Check that the `/root/Traefik/config/acme.json` file is not empty, if this is the case, check your DNS or make sure it is `chmod 0600`.

You can therefore normally access your Traefik dashboard via [https://traefik.your_domain.tld](https://traefik.your_domain.tld).
This dashboard contains information about entry points, routes, middlewares etc... in practice you will probably never go on this dashboard in fact.

![bnty_docker_traefik](bnty_docker_traefik.png)

### Poc
This container uses PHP 7.4 as well as Apache.
In fact, I use it to host my payloads files or for example a PHP file to exploit some SSRF (cf : [Exploiting my first SSRF](https://www.jomar.fr/posts/2020/03/en-exploiting-my-first-ssrf/)).

When the container starts, it will deliver the files that are in the `/root/Poc/www/` directory. So if you want to add files or modify existing ones, this is where you should look. They will be directly available at the root of your domain [https://poc.your_domain.tld](https://poc.your_domain.tld)

### XSS-Catcher
This container allows me to have my own blind-XSS service, as the name of the title indicates, it's [XSS-Catcher](https://github.com/daxAKAhackerman/XSS-Catcher).

This container takes a good ten minutes to start the first time, so be patient. Then, all you need to do is go to [https://xss.your_domain.tld](https://xss.your_domain.tld) and log in with the `admin / xss` credentials to start using the service.

![bnty_docker_xss](bnty_docker_xss.png)

### Rengine
The container that gave me the most trouble, but also the one I needed the most ...

I also made several modifications on my side to make it work via Traefik. The basic problem is that the container uses its own reverse proxy that initially manages SSL certificates, except that it doesn't work on Firefox, so I modified the configuration of the Rengine Nginx container to work via Traefik.

Why keep a second reverse proxy would you tell me ? simply because without it you won't have CSS / JS. I didn't look too much but it seems that for example on the login, Rengine checks that you are authenticated before loading the static files, which is of course not the case, the Nginx reverse proxy makes sure to overload its files so that they are returned to you.

Rengine will be accessible via [https://recon.your_domain.tld](https://recon.your_domain.tld) as long as you have entered your IP address correctly in `Traefik/dynamic/middlewares.toml`

![bnty_docker_rengine](bnty_docker_rengine.png)

## Webhook
Pretty handy if you don't have access to burp collaborator or if you don't want to use it. It can also make it easier to manage if you have several requests to make and it's more ergnomic.

![Bounty Infrastructure - Webhook](./bnty_docker_webhook.png)

Webhook will be accessible via [https://webhook.your_domain.tld](https://webhook.your_domain.tld)

## Add a new container
In case you want to add a new container, here's what you need to do.

Open the docker-compose.yml of your new service and add the following lines : (If needed, take the example of the containers we just installed :) )
```yml
networks: #If the line doesn't exist add the, otherwise add only the network
      - traefik-proxy
[...]
    #Don't forget to change {services} by your services name and {your_sub_domain.tld} by your subdomain.
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.{services}.rule=Host(`{your_sub_domain.tld}`)"
      - "traefik.http.routers.{services}.entrypoints=websecure"
      - "traefik.http.routers.{services}.tls.certresolver=letsencrypt"

[...]
#At the end of file
networks:
  {services}:
  traefik-global-proxy:
    external: true
```
In case your service exposes a port, for example via the `port: 8000:8000` directive, you can remove the line, it's managed by Traefik :)
If you want to protect your container with IP protection like Rengine and Traefik, simply add the line `- "traefik.http.routers.{services}.middlewares=ipwhitelist@file"` in labels.

## Backup & conclusion
I went from a Proxmox / LXC installation to a full Docker installation and this was not planned but it also makes my backups a lot easier.

I use a service like "Bucket S3" on Scaleway. And instead of backing up my LXC containers and sending them on my bucket (which is quite a lot of weight) I just have to send my docker-composites, configuration files and the files I want to back up.

This also facilitates restoration in the event of a complete crash. Rather than reinstalling a Proxmox and reimporting each LXC container, I just have to unroll the script that is at the beginning of this tutorial on a new server.
