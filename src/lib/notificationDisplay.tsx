import React from 'react';

export const renderNotificationBody = (body: string, notificationType?: string) => {
  if (notificationType !== 'phone_found') return body;

  const phoneMatch = body.match(/(?:\+?\d[\d\s().-]{5,}\d)/);
  if (!phoneMatch || phoneMatch.index === undefined) return body;

  const phone = phoneMatch[0].replace(/\D/g, '');
  if (phone.length < 7 || phone.length > 15) return body;

  const before = body.slice(0, phoneMatch.index);
  const after = body.slice(phoneMatch.index + phoneMatch[0].length);

  return (
    <>
      {before}
      <a
        href={`tel:${phone}`}
        className="font-bold text-imei-cyan underline underline-offset-2 hover:text-white"
        onClick={(event) => event.stopPropagation()}
      >
        {phoneMatch[0]}
      </a>
      {after}
    </>
  );
};
