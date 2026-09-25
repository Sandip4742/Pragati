import {env} from 'cloudflare:workers';
export function database(){if(!env.DB)throw new Error('School data is temporarily unavailable. Please try again.');return env.DB;}
export function bucket(){if(!env.BUCKET)throw new Error('Attachments are temporarily unavailable.');return env.BUCKET;}
