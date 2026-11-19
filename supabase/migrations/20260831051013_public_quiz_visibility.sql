-- Public discovery is explicitly opt-in; every existing quiz remains unlisted.
alter table public.quizzes
  add column if not exists visibility text not null default 'unlisted';

update public.quizzes
set visibility = 'unlisted'
where visibility is null;

do $$
begin
  alter table public.quizzes
    add constraint quizzes_visibility_check
    check (visibility in ('unlisted', 'public'));
exception
  when duplicate_object then null;
end $$;

create index if not exists quizzes_public_created_idx
  on public.quizzes (created_at desc)
  where visibility = 'public';
