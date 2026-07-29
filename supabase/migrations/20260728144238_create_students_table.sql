create table students (
  email text primary key,
  name text not null,
  wechat text not null default '',
  wx_name text not null default '—',
  nick text not null default '—',
  region text not null,
  level text not null,
  source text not null,
  tags jsonb not null default '[]',
  note text not null default '',
  gender text not null default '—',
  age text not null default '—',
  industry text not null default '—'
);
