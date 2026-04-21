-- Supabase SQL Editor에서 실행: 챌린지 샘플 10건
-- 조건: 진행 중 5 (start_date <= now() AND end_date > now()), 종료 3, 시작 예정 2
-- 앱 로직과 동일하게 진행 중은 start가 과거·현재, end가 미래.

insert into public.challenges (title, description, start_date, end_date, banner_weight, created_at)
values
  -- ━━━ 진행 중 5건 ━━━
  (
    '냥이 낮잠 자는 곳 인증',
    '쿠션 위? 박스 안? 우리 냥이가 제일 편해하는 낮잠 스팟을 사진으로 남겨요.',
    now() - interval '3 days',
    now() + interval '10 days',
    50,
    now() - interval '3 days'
  ),
  (
    '최애 간식 인증 챌린지',
    '참치·닭가슴살·츄르… 냥이 눈이 반짝이는 그 간식과 함께 인증샷을 올려주세요.',
    now() - interval '1 day',
    now() + interval '14 days',
    40,
    now() - interval '1 day'
  ),
  (
    '아침 기지개 영상',
    '하품하고 기지개하는 아침 루틴! 짧은 영상이나 연사로도 OK예요.',
    now() - interval '5 days',
    now() + interval '7 days',
    35,
    now() - interval '5 days'
  ),
  (
    '캣타워 점령 인증',
    '최상단 칸을 차지한 집사의 영역? 냥이의 영역? 점령 순간을 공유해요.',
    now() - interval '2 days',
    now() + interval '12 days',
    30,
    now() - interval '2 days'
  ),
  (
    '창가 감성샷 — 오늘의 하늘과 냥이',
    '창틀에 앉아 밖을 보는 뒷모습이나 햇살 받는 옆얼굴, 감성 한 컷을 남겨요.',
    now(),
    now() + interval '21 days',
    25,
    now()
  ),

  -- ━━━ 종료 3건 (end_date < now()) ━━━
  (
    '털뭉치 미용 전후 인증',
    '미용·빗질 전후 비교샷이나 브러싱 후 폭신한 모습을 올려주세요. (종료된 챌린지)',
    now() - interval '40 days',
    now() - interval '5 days',
    10,
    now() - interval '40 days'
  ),
  (
    '발바닥 하트 인증',
    '핑크 콩패드 클로즈업! 하트 모양이 보이면 더 좋아요. (종료)',
    now() - interval '30 days',
    now() - interval '8 days',
    8,
    now() - interval '30 days'
  ),
  (
    '캣닢 필수샷 — 사료그릇 앞 대기',
    '밥 주세요 눈빛과 그릇 앞 자세, 전설의 캣닢 순간을 공유해요. (종료)',
    now() - interval '25 days',
    now() - interval '2 days',
    5,
    now() - interval '25 days'
  ),

  -- ━━━ 시작 예정 2건 (start_date > now()) ━━━
  (
    '여름 더위 대비 — 쿨매트·얼음팩 인증',
    '더위 대비템과 함께한 냥이 모습을 곧 시작할 챌린지에서 모아볼게요.',
    now() + interval '5 days',
    now() + interval '26 days',
    60,
    now()
  ),
  (
    '크리스마스 코스튬 인증',
    '리본·루돌프 모자 등 가볍게만! 스트레스 없는 코스튬샷을 나중에 함께해요.',
    now() + interval '14 days',
    now() + interval '45 days',
    55,
    now()
  );
