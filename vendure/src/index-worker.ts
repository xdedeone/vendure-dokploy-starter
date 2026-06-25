import { bootstrapWorker } from '@vendure/core';
import { config } from './vendure-config';

bootstrapWorker(config)
    .then(async worker => {
        await worker.startJobQueue();
        await worker.startHealthCheckServer({port: 3000 });
    })
    .catch(err => {
        console.log(err);
    });
