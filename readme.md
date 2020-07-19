# lex-hook

lex-hook is a library designed to make it easy to create AWS Lambda Code Hooks for Lex Bot Intents.  

Consider this an Alpha-1 release.  Interfaces will change.


## Getting Started

The example below illustrates how to implement a Dialog and Fulfillment Code Hook for a simple Lex Bot using <code>lex-hook</code>.  


### Install AWS Lambda function code for Order Flowers Bot Intent

Within the <code>examples</code> directory there is sample code for an AWS Lambda Code Hook created using the <code>lex-hook</code>
library.  Follow the steps below to install dependencies, compile, test, and package the code so it can be used to create
a Lambda function.  Once this is done, create a Lex Bot, and configure the Bot to interact with the Lambda function just created.  Finally, 
from within the AWS Console, build the Lex Bot, and test it out.
 
1) Install.

        /home/user/lex-hook/examples/order-flowers-bot$ npm install

2) Compile

        /home/user/lex-hook/examples/order-flowers-bot$ npm run compile

3) Test

        /home/user/lex-hook/examples/order-flowers-bot$ npm run test

4) Build using WebPack.  Webpack will create a single JS file encompassing the code and all dependencies, located at 
<code>./dist/bundle/bundle.js</code>.

        /home/user/lex-hook/examples/order-flowers-bot$ npm run build.

5) Create a Lambda function, and name it <code>orderflowers-code-hook</code>. 

6) Create a zip file containing <code>./dist/bundle/bundle.js</code>.  Then, upload the zip file to the <code>orderflowers-code-hook</code> Lamnbda function via the AWS Console, or via AWS CLI.

7) Create Lex Bot.  See https://docs.aws.amazon.com/lex/latest/dg/gs-bp-create-bot.html. 

8) Test in the AWS Console.


## Library Overview

In lieu of more formal documentation, the code, examples, and tests and corresponding documentation provide a good enough overview.

The source code @ <code>./src/index.ts</code> is composed of a number of logical components.  These include Interfaces relevant to the library as a whole, Interfaces and classes relevant to dialog handling, and utility classes and methods.

There is a simple test @ <code>./tests/lex-hook.test.ts</code>.  This serves as a simple, and admittedly incomplete test of the library itself.

Within <code>./examples/order-flowers-bot/src</code>, there is an <code>index.ts</code> module that contains the Lambda entry-point function.  This module uses a <code>LexEventHandler</code> instance
defined within the Intent-specific <code>./examples/order-flowers-bot/src/order-flowers-intent.ts</code> module.  This Intent specific module defines Dialog and Fulfillment handlers, and demonstrates using
a hook that is invoked each time a Slot value is evaluated.  Finally, see <code>./examples/order-flowers-bot/tests/order-flowers-bot.test.ts</code> for an example test of event handling.


## To Dos

1) Logging framework.

2) Hook-functions should return Promises, and be invoked asynchronously.

3) Enable route function to handle multiple Intents.


## informational references

https://blog.logrocket.com/publishing-node-modules-typescript-es-modules/

https://itnext.io/step-by-step-building-and-publishing-an-npm-typescript-package-44fe7164964c

https://khalilstemmler.com/blogs/typescript/eslint-for-typescript/

