export const portalRoles=[
 {id:'admin',label:'School Admin',description:'Manage your school'},
 {id:'platform',label:'Platform Admin',description:'Manage the school platform'},
 {id:'parent',label:'Parent',description:'Follow your child’s school day'},
 {id:'teacher',label:'Teacher',description:'Manage your assigned classes'},
];
export const portalRole=(value?:string)=>portalRoles.some(r=>r.id===value)?value!:'admin';
export const ROLE_COOKIE='schoolconnect-portal';
