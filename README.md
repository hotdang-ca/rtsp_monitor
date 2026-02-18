# RTSP Monitor & Recorder

A simple, Dockerized solution to monitor RTSP security cameras and record continuous 10-second video clips.

## Why this?

It was difficult to find a free and **SIMPLE** RTSP monitor and recorder. While several projects do exist, they do not check the boxes for being both free and simple.

## Features
- **Live Monitoring**: Low-latency HLS stream via MediaMTX (`cam1_monitor`).
- **Continuous Recording**: Saves 10s MP4 segments using FFmpeg directly from the source.
- **Robustness**: Automatically reconnects on stream loss. Handles silent audio tracks by disabling audio for live stream stability.
- **Web Interface**: Simple viewer for the live feed and historical recordings.

## Architecture
**Camera** (RTSP) -> **Recorder** (FFmpeg) -> **MediaMTX** (RTSP/HLS Server) -> **Browser**

The recorder pulls directly from the camera to ensure recording stability, then pushes a processed stream to MediaMTX for browser viewing.

## Setup

1.  **Configure Environment**:
    Copy the example environment file:
    ```bash
    cp .env.example .env
    ```
    Edit `.env` and set your `RTSP_SOURCE_1`, `RTSP_SOURCE_2`, etc. URLs:
    ```ini
    RTSP_SOURCE_1=rtsp://user:password@192.168.1.50:554/stream
    RTSP_SOURCE_2=rtsp://user:password@192.168.1.51:554/stream
    ```

2.  **Network Configuration**:
    Ensure ports `8888` (HLS), `8554` (RTSP), and `3000` (Web UI) are free on your host.

3.  **Start**:
    ```bash
    docker-compose up -d --build
    ```

4.  **Access**:
    - **Web Interface**: [http://localhost:3000](http://localhost:3000)
    - **Live HLS Stream**: [http://localhost:8888/cam1_monitor/index.m3u8](http://localhost:8888/cam1_monitor/index.m3u8)

## TODO

- [x] support multiple cameras
- [ ] support live monitoring on iOS
- [ ] support recordings timeline scrubbing
- [ ] support timeline export

## Troubleshooting

### No Audio / Stalled Stream
If your camera advertises an audio track but sends no data (common with some Reolink/Amcrest setups), FFmpeg may stall.
**Fix**: The recorder is configured to disable audio (`-an`) for the live stream push to ensure video stability.

### Connection Refused (Mac/Windows)
If using Docker Desktop, use `network_mode: bridge` (default) and ensure ports are mapped in `docker-compose.yml`. avoid `network_mode: host` as it isolates ports within the VM.

## Directory Structure
- `recorder/`: Node.js service + FFmpeg logic.
- `recordings/`: Local volume for stored video clips.
- `mediamtx.yml`: Configuration for the streaming server (handles `cam1_monitor` publishing).
