const path = require('path')

module.exports = {
    entry: './src/index.ts',
    node: { fs: 'empty'},
    mode: 'production',
    target: 'node',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/
            }
        ]
    },
    resolve: {
        extensions: [ '.ts', '.js' ]
    },
    externals: [ 'aws-sdk' ],
    output: {
        filename: 'bundle.js',
        path: path.resolve(__dirname, 'dist/bundle'),
        libraryTarget: 'umd'
    }
}