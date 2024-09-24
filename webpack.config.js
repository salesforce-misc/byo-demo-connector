require('custom-env').env();

module.exports = {
    mode: 'development',
    devtool: 'source-map',
    entry: {
        main: './src/main/index.js',
        remote: './src/remote-control/main.js',
        login: './src/login/index.js',
        ottapp: './src/byo-ott-app/main.js',
        ccaas: './src/remote-control/main.js'
    },
    devServer: {
        server: {
          type: 'https',
          options: {
            cert: 'ca/cert.pem',
            key: 'ca/cert.key',
          }  
        },
        static: {
            directory: __dirname + '/public'
        },
        host: '0.0.0.0',
        proxy: {
            '/api': process.env.SERVER_URL,
            '/socket.io': {
                target: process.env.SERVER_URL,
                ws: true
            },
        },
        allowedHosts: "all",
        devMiddleware: {
            index: '/app_debug.html'
        },
        historyApiFallback: {
            index: 'app_debug.html',
            rewrites: [
                {from: /^\/$/, to: 'app_debug.html'},
                {from: /^\/remote/, to: 'remote.html'},
                {from: /^\/login/, to: 'login.html'},
                {from: /^\/ccaas/, to: 'ccaas.html'},
                {from: /^\/ottapp/, to: 'ottapp.html'}
            ]
        }
    },
    module: {
        rules: [
            {
                test: /\.m?js$/,
                exclude: /(node_modules)/,
                    // Exclude the following from the exclusion
                include: /(node_modules\/scv-connector-base)/,
                enforce: 'pre',
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env']
                    }
                }
            }
        ]
    },
    output: {
        publicPath: '/assets/',
        path: __dirname + '/dist/',
        filename: '[name].bundle.js'
    }
};
