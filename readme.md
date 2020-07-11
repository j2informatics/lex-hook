# lex-hook

lex-hook is a library designed to make it easy to create AWS Lambda Code Hooks for Lex Bot Intents.  I have not yet committed this
to the npm repository, but plan to do so shortly.

Consider this an Alpha-1 release.  Interfaces will change.


## Getting Started

The example below illustrates how to implement a Dialog and Fulfillment Code Hook for a simple Lex Bot using <code>lex-hook</code>.  Given that <code>lex-hook</code> is not yet in npmjs, there are some extra steps to follow.  


### Install and Test lex-hook

1) Clone the repo. This will pull down the lex-hook project as well as a sample project.

2) Use npm to install dependencies for lex-hook specifically.

        /home/user/lex-hook$ npm install

3) Compile. This will be done automatically by npm when installing, but for refernce sake this is the command.  See scripts within
<code>package.json</code> for a full view of script commands. 

        /home/user/lex-hook$ npm run compile

4) Test.  Run a single smoke test.

        /home/user/lex-hook$ npm run test

5) Pack.  Create a gzipped tarball of the lex-hook project suitable for installation via npm.

        /home/user/lex-hook$ npm pack
        /home/user/lex-hook$ ...
        /home/user/lex-hook$ lex-hook-0.0.1.tgz


### Install  AWS Lambda function code for Order Flowers Bot Intent

Within the <code>examples</code> directory there is sample code for an AWS Lambda Code Hook created using the <code>lex-hook</code>
library.  Follow the steps below to install dependencies, compile, test, and package the code so it can be used to create
a Lambda function.  Once this is done, create a Lex Bot, and configure the Bot to interact with the Lambda function just created. 

Finally, from within the AWS Console, build the Lex Bot, and test it out.
 

1) Use npm to install dependencies for lex-hook specifically.

        /home/user/lex-hook/examples/order-flowers-bot$ npm install

2) Use npm to install the packed lex-hook-0.0.1.tgz file created above.

        /home/user/lex-hook/examples/order-flowers-bot$ npm install ../../lex-hook-0.0.1.tgz

3) Compile

        /home/user/lex-hook/examples/order-flowers-bot$ npm run compile

4) Test

        /home/user/lex-hook/examples/order-flowers-bot$ npm run test

5) Build using WebPack.  Webpack will create a single JS file encompassing all dependencies, located at <code>./dist/bundle/bundle.js</code>.

        /home/user/lex-hook/examples/order-flowers-bot$ npm run build.

6) Create a Lambda function, and name it <code>orderflowers-code-hook</code>. 

7) Create a zip file containing <code>./dist/bundle/bundle.js</code>.  Then, upload the zip file to the <code>orderflowers-code-hook</code> Lamnbda function via the AWS Console, or via AWS CLI.

8) Create Lex Bot.  See https://docs.aws.amazon.com/lex/latest/dg/gs-bp-create-bot.html. 

9) Test in the AWS Console.


## Library Overview

See comments in the code.


## To Dos

1) Logging framework

2) Separate into multiple modules

3) Enable route function to handle multiple Intents

4) Convert to ES Lint


## informational references

https://blog.logrocket.com/publishing-node-modules-typescript-es-modules/

https://itnext.io/step-by-step-building-and-publishing-an-npm-typescript-package-44fe7164964c

https://khalilstemmler.com/blogs/typescript/eslint-for-typescript/

