# Prometheus service scanner

### The lazy mans service discovery

This project is meant to provide file based service discovery for prometheus. It is targeted at people who are too lazy to properly set up their scrape targets.
The project contains a small web interface (no auth) for configuring the scanning. By default it will ping every port from 1000 - 10000 on 192.168.10.0 - 192.168.10.255 and add all prometheus compatible endpoints to targets.json

docker-compose.yml:

    prometheus:
      image: prom/prometheus
      restart: unless-stopped
      volumes:
        - prometheus_data:/prometheus
        - ./prometheus.yml:/etc/prometheus/prometheus.yml
        - ./service_scanner/targets.json:/etc/prometheus/targets.json
      command:
          - '--config.file=/etc/prometheus/prometheus.yml'
      ports:
          - 9901:9090
    prometheus-service-scanner:
      image: "danielvestol/prometheus-service-scanner"
      restart: unless-stopped
      volumes:
      - ./service_scanner:/data
      ports:
      - '9902:3000'

prometheus.yml:

    global:
      scrape_interval: 10s
    scrape_configs:
    - job_name: 'servicediscovery'
        file_sd_configs:
        - files:
          - 'targets.json'

Output of targets.json:

    [
        {
            "labels": {
                "job": "service-discovery"
            },
            "targets": [
                "192.168.10.101:8080",
                "192.168.10.101:8081",
                "192.168.10.170:5900"
            ]
        }
    ]