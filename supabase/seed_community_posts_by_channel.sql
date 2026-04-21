-- =============================================================================
-- 커뮤니티 피드 테스트 데이터: 채널(분류)별 10건 × 5 = 50건 (SQL Editor · postgres)
--
-- 삭제 마커: body에 '[community-seed]' 포함 → 재실행 시 해당 행만 DELETE 후 INSERT
--
-- 작성자: challenge_grid_seed_* 시드 유저 풀(챌린지 그리드 시드와 동일)이 있으면
--         그중에서 순환, 없으면 profiles 최대 10명 순서대로 순환
-- 전제: public.profiles에 최소 1명
-- =============================================================================

begin;

delete from public.posts
where body like '%[community-seed]%';

do $$
begin
  if not exists (select 1 from public.profiles limit 1) then
    raise exception 'public.profiles가 비었습니다. 로그인·프로필 생성 후 실행하세요.';
  end if;
end $$;

with pool as (
  select coalesce(
    (
      select array_agg(p.id order by u.email)
      from public.profiles p
      join auth.users u on u.id = p.id
      where u.email like 'challenge\_grid\_seed\_%@test.invalid' escape '\'
    ),
    (
      select array_agg(id order by created_at)
      from (select id, created_at from public.profiles order by created_at limit 10) x
    )
  ) as ids
),
src as (
  select *
  from (
    values
      -- food × 10
      ('food', 1, '[community-seed] 푸드#1: 키튼 때부터 쓰던 캔 브랜드를 바꿔볼까 하는데, 냄새 덜 나고 잘 먹는 습식 추천 받아요.'),
      ('food', 2, '[community-seed] 푸드#2: 건식만 주다가 반습식으로 넘어가는 첫 주 — 양 조절이 아직 애매해요.'),
      ('food', 3, '[community-seed] 푸드#3: 참치 토핑 캔은 잘 먹는데 닭만 주면 잘 안 비워요. 입맛 차이인가요?'),
      ('food', 4, '[community-seed] 푸드#4: 사료 입식→반습식 전환 일주일차, 변 상태는 괜찮은데 물을 더 마시게 됐어요.'),
      ('food', 5, '[community-seed] 푸드#5: 덴탈 간식은 꼭 필요할까요? 습식 위주라 이빨 걱정이 되기 시작했어요.'),
      ('food', 6, '[community-seed] 푸드#6: 저알러지 라인으로 바꾼 뒤로 긁는 빈도가 줄었어요. 단백질원이 핵심이었던 것 같아요.'),
      ('food', 7, '[community-seed] 푸드#7: 자동 급식기에 건식 넣어두면 밤에 쏟아먹는데, 하루 분량 나눠주는 팁 있을까요?'),
      ('food', 8, '[community-seed] 푸드#8: 냉동 생식 도전 중 — 해동 시간이랑 보관 용기 정리법 공유해 주세요.'),
      ('food', 9, '[community-seed] 푸드#9: 간식은 훈련용으로만 주려는데 눈빛 공격이 너무 세서 매일 한두 개씩…'),
      ('food', 10, '[community-seed] 푸드#10: 물 많이 먹이려고 브로스 추가해 봤는데, 처음엔 의심하더니 이제는 그걸 기다려요.'),
      -- health × 10
      ('health', 1, '[community-seed] 헬스#1: 정기 검진 때 혈액검사만 했는데, 시니어는 초음파도 같이 하는 게 일반적인가요?'),
      ('health', 2, '[community-seed] 헬스#2: 구토가 하루에 한 번씩 일주일 — 식이성인지 병원 가야 할 타이밍이 헷갈려요.'),
      ('health', 3, '[community-seed] 헬스#3: 치석 스케일링 후 이틀간은 사료를 불려줬어요. 회복이 빨랐어요.'),
      ('health', 4, '[community-seed] 헬스#4: 헤어볼이 잦아서 그루밍 시간 줄이려고 빗질 루틴 만들었어요.'),
      ('health', 5, '[community-seed] 헬스#5: 공복구토? 아침에만 토하는 패턴이 있어서 야간 급식 소량 넣었더니 나아졌어요.'),
      ('health', 6, '[community-seed] 헬스#6: 체중이 조금씩 늘어서 사료 칼로리만 낮춰봤는데, 활동량은 그대로 유지 중이에요.'),
      ('health', 7, '[community-seed] 헬스#7: 눈곱이 평소보다 많을 때 병원 vs 홈케어 구분하는 기준이 있을까요?'),
      ('health', 8, '[community-seed] 헬스#8: 심장사상충 예방약 복용 시작 — 부작용 없이 잘 지내는 중이라 안심돼요.'),
      ('health', 9, '[community-seed] 헬스#9: 스트레스성 피모숭숭 — 환경 바꾼 뒤로는 털갈이 시즌만 빼고 괜찮아졌어요.'),
      ('health', 10, '[community-seed] 헬스#10: 물 그릇 여러 곳에 두니 소변량이 늘고 색도 연해졌어요. 신장 쪽으로는 좋은 신호겠죠?'),
      -- daily × 10
      ('daily', 1, '[community-seed] 일상#1: 새 캣타워 올린 날 — 밤새 안 자고 탐험하다 아침에 곯아떨어졌어요.'),
      ('daily', 2, '[community-seed] 일상#2: 창가 햇살 자리를 서로 양보하지 않아서, 쿠션을 하나 더 샀더니 나란히 눕더라고요.'),
      ('daily', 3, '[community-seed] 일상#3: 재택 중 키보드 위 점령 — 모니터 뒤로 옮기면 5분 뒤 또 와 있음.'),
      ('daily', 4, '[community-seed] 일상#4: 빨래 개는 척하면 바구니 속으로 파고드는 게 루틴이 됐어요.'),
      ('daily', 5, '[community-seed] 일상#5: 문 앞에서 기다리다가 제가 들어오면 먼저 집으로 들어가요. 예의바른 고양이?'),
      ('daily', 6, '[community-seed] 일상#6: 새벽 4시 달리기 시즌 — 장난감 지옥 끝에 자동 장난감으로 체력 소모 중.'),
      ('daily', 7, '[community-seed] 일상#7: 낮잠 자세가 매일 다름. 오늘은 반쯤 떨어질 듯한 난간 자세.'),
      ('daily', 8, '[community-seed] 일상#8: 이사 후 일주일 — 숨는 시간이 줄고 탐색 범위가 거실까지 넓어졌어요.'),
      ('daily', 9, '[community-seed] 일상#9: 빗질할 때만 살짝 으르렁, 끝나면 꼬리로 감싸며 미안한 척하는 것 같아요.'),
      ('daily', 10, '[community-seed] 일상#10: 손님 오면 침대 밑으로 가는 아이 vs 소파 위에서 감시하는 아이, 둘 다 귀여워요.'),
      -- goods × 10
      ('goods', 1, '[community-seed] 굿즈#1: 브러쉬가 너무 부드러우면 털이 잘 안 빠져요. 중간 굵기 추천 부탁해요.'),
      ('goods', 2, '[community-seed] 굿즈#2: 자동 화장실 후기 — 소음은 있는데 먼지랑 냄새는 확실히 줄었어요.'),
      ('goods', 3, '[community-seed] 굿즈#3: 급수기 필터 교체 주기, 앱 알림 맞춰두면 잊지 않아서 좋아요.'),
      ('goods', 4, '[community-seed] 굿즈#4: 캐리어는 위에서 열리는 타입이 진짜 편했어요. 옆문만 있던 건 스트레스였음.'),
      ('goods', 5, '[community-seed] 굿즈#5: 스크래처 소파형 샀더니 가구 긁기는 줄었는데, 이제는 스크래처만 갈아먹어요.'),
      ('goods', 6, '[community-seed] 굿즈#6: LED 장난감은 배터리 소모가 빨라서 충전식으로 갈아탔어요.'),
      ('goods', 7, '[community-seed] 굿즈#7: 모래 두 종류 섞어 쓰면 덩어리짐이 좋아진다고 해서 시도 중입니다.'),
      ('goods', 8, '[community-seed] 굿즈#8: 털 제거 롤러보다 실리콘 장갑이 쇼파에 더 잘 붙더라고요.'),
      ('goods', 9, '[community-seed] 굿즈#9: 이름표 목걸이 무게 — 10g 이하로 맞추라는 글 봤는데 꼭 그런가요?'),
      ('goods', 10, '[community-seed] 굿즈#10: 창문용 해먹 설치 각도 실패 세 번째 — 이번엔 앵커를 바꿔서 붙였어요.'),
      -- koshort × 10
      ('koshort', 1, '[community-seed] 코숏#1: 숏츠 각도 연구 중 — 바닥 샷이 댓글이 제일 많았어요.'),
      ('koshort', 2, '[community-seed] 코숏#2: 배경음악 없이 야옹만 넣었더니 알고리즘이 이상하게 잘 태워줬어요.'),
      ('koshort', 3, '[community-seed] 코숏#3: 15초 안에 하이라이트 모으기 — 졸린 눈 깜빡임 클립이 1등.'),
      ('koshort', 4, '[community-seed] 코숏#4: 자막 큰 글씨 vs 작은 글씨, 모바일에서는 큰 쪽이 체류 시간이 길었어요.'),
      ('koshort', 5, '[community-seed] 코숏#5: 먹방 ASMR은 소리 민감도 조절이 어렵네요. 노이즈 제거 프리셋 추천?'),
      ('koshort', 6, '[community-seed] 코숏#6: 썸네일 고정 프레임 vs 움짤 — 움짤이 클릭률이 조금 더 높았습니다.'),
      ('koshort', 7, '[community-seed] 코숏#7: 해시태그는 3개만 넣는 게 조회수 안정적이었어요. 너무 많이 넣으면 흐려지는 느낌.'),
      ('koshort', 8, '[community-seed] 코숏#8: 세로 9:16 원본 그대로 vs 크롭 — 크롭한 게 피드에서 덜 잘리더라고요.'),
      ('koshort', 9, '[community-seed] 코숏#9: "첫 1초 훅" 연습 중 — 손가락으로 장난감 튕기는 장면으로 시작했더니 완시율↑'),
      ('koshort', 10, '[community-seed] 코숏#10: 댓글에 나온 질문 모아서 Q&A 숏 찍었어요. 다음엔 라이브도 해볼까 해요.')
  ) as t(channel, ord, body)
),
numbered as (
  select
    s.channel,
    s.ord,
    s.body,
    row_number() over (order by
      case s.channel
        when 'food' then 1
        when 'health' then 2
        when 'daily' then 3
        when 'goods' then 4
        when 'koshort' then 5
      end,
      s.ord
    ) as rn
  from src s
)
insert into public.posts (
  user_id,
  cat_id,
  channel,
  body,
  agent_summary,
  like_count,
  comment_count,
  image_urls,
  created_at
)
select
  p.ids[1 + ((n.rn - 1) % cardinality(p.ids))],
  null,
  n.channel,
  n.body,
  case
    when n.rn % 3 = 0 then '요약: 집사 경험 공유·질문 위주의 게시글입니다.'
    else null
  end,
  (n.ord * 2 + length(n.channel)) % 42,
  (n.ord + length(n.channel)) % 9,
  case
    when n.rn % 3 = 0 then
      array[
        format(
          'https://picsum.photos/seed/community-%s-%s/720/480',
          n.channel,
          n.ord::text
        )
      ]::text[]
    else '{}'::text[]
  end,
  now() - (n.rn * interval '23 minutes')
from numbered n
cross join pool p;

commit;
