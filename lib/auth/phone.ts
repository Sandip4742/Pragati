// Indian local numbers default to +91; international numbers require a country code.
export function normalizePhone(value:unknown){
 if(typeof value!=='string')return '';
 let n=value.trim().replace(/[\s()-]/g,'');
 if(/^[6-9]\d{9}$/.test(n))n='+91'+n;
 else if(/^91[6-9]\d{9}$/.test(n))n='+'+n;
 return /^\+[1-9]\d{7,14}$/.test(n)?n:'';
}
