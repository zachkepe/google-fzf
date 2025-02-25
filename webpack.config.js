const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

/**
 * Webpack configuration
 * @type {import('webpack').Configuration}
 */
module.exports = {
    mode: 'production',
    entry: {
        background: './src/background/background.js',
        content: './src/content/content.js',
        popup: './src/popup/popup.js',
        'search.worker': './src/workers/search.worker.js',
        pdfViewer: './src/pdfViewer/pdfViewer.js'
    },
    output: {
        filename: '[name].bundle.js',
        path: path.resolve(__dirname, 'dist'),
        clean: true,
        publicPath: '/'
    },
    module: {
        rules: [
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader']
            },
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env']
                    }
                }
            }
        ]
    },
    resolve: {
        extensions: ['.js', '.json', '.wasm'],
        fallback: {
            'pdfjs-dist': require.resolve('pdfjs-dist')
        }
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                { from: 'src/popup/popup.html', to: 'popup.html' },
                { from: 'src/popup/popup.css', to: 'popup.css' },
                { from: 'manifest.json', to: 'manifest.json' },
                { from: 'src/data/embeddings.json', to: 'embeddings.json' },
                { from: 'node_modules/pdfjs-dist/build/pdf.worker.mjs', to: 'pdf.worker.bundle.js' },
                { from: 'src/pdfViewer/pdfViewer.html', to: 'pdfViewer.html' },
                { from: 'icons', to: 'icons' }
            ]
        })
    ]
};