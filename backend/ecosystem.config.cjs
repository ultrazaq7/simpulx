module.exports = {
  apps: [{
    name: 'simpulx-api',
    script: 'dist/main.js',
    cwd: '/opt/simpulx/backend',
    instances: 4,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
    },
    max_memory_restart: '500M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: '/var/log/simpulx/error.log',
    out_file: '/var/log/simpulx/out.log',
    merge_logs: true,
    listen_timeout: 10000,
    kill_timeout: 5000,
  }]
};
