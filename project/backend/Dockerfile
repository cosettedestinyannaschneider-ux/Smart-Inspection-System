FROM node:20-bookworm-slim

WORKDIR /app

# 安装 Python 运行环境，支持模板填充脚本；PDF 转换在 Linux 下会自动降级
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY tools/requirements.txt /tmp/requirements.txt
RUN python3 -m venv /opt/venv \
  && /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.txt

ENV PATH="/opt/venv/bin:${PATH}"

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
