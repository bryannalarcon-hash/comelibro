import nodemailer from 'nodemailer';
export function mailer(env = process.env, testSender) {
  if (testSender && env.NODE_ENV !== 'test') throw new Error('Test mail capture is forbidden outside NODE_ENV=test');
  const configured = !!(env.SMTP_USER && env.SMTP_PASSWORD && env.SMTP_FROM);
  const transport = configured ? nodemailer.createTransport({host:env.SMTP_HOST || '127.0.0.1',port:Number(env.SMTP_PORT || 1587),secure:false,requireTLS:true,auth:{user:env.SMTP_USER,pass:env.SMTP_PASSWORD},tls:{servername:env.SMTP_SERVERNAME || 'mail.bryannalarcon.com',rejectUnauthorized:true},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000}) : null;
  return {configured:configured || !!testSender,async send({email,kind,token,origin}) {
    const link = `${origin}/?${kind === 'verify' ? 'verify' : 'reset'}=${encodeURIComponent(token)}`;
    const message = {from:env.SMTP_FROM,to:email,subject:kind === 'verify' ? 'Verify your Comelibro email' : 'Reset your Comelibro password',text:`${kind === 'verify' ? 'Verify your email' : 'Reset your password'} using this link:\n\n${link}\n\nThis link expires in ${kind === 'verify' ? '24 hours' : '30 minutes'}. If you did not request this, ignore it.`};
    if (testSender) {await testSender({...message,kind,token}); return {status:'sent',message:'Email captured by the isolated test sender.'};}
    if (!transport) return {status:'failed',message:'Email delivery is unavailable. Please try resending later.'};
    try {const sent=await transport.sendMail(message); if(!sent.accepted?.length) throw new Error('SMTP did not accept recipient'); return {status:'sent',message:'Email sent. Check your inbox and spam folder.'};}
    catch {return {status:'failed',message:'Email could not be delivered. Please try resending later.'};}
  }};
}
