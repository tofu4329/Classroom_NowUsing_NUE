/**
 * 奈良教育大学 空き教室・利用状況チェッカー & 科目検索・My時間割
 * Application Logic
 */

(function () {
  'use strict';

  // グローバルデータ取得
  const DATA = window.SYLLABUS_DATA;
  if (!DATA || !DATA.lessons || !DATA.rooms) {
    console.error('シラバスデータの読み込みに失敗しました。');
    const errBox = document.createElement('div');
    errBox.style.cssText = 'padding: 20px; background: #fee2e2; color: #991b1b; text-align: center; font-weight: bold; margin: 20px; border-radius: 8px;';
    errBox.textContent = 'シラバスデータの読み込みに失敗しました。data.js が正しく読み込まれているか確認してください。';
    document.body.prepend(errBox);
    return;
  }

  // データ正規化（JSONシリアライズ時の防御的変換）
  DATA.lessons.forEach(l => {
    if (!Array.isArray(l.slots)) {
      l.slots = (l.slots !== undefined && l.slots !== null) ? [l.slots] : [];
    }
    if (!Array.isArray(l.rooms)) {
      l.rooms = (l.rooms !== undefined && l.rooms !== null) ? [l.rooms] : [];
    }
    if (!Array.isArray(l.periodNums)) {
      l.periodNums = (l.periodNums !== undefined && l.periodNums !== null) ? [l.periodNums] : [];
    }
  });

  // LocalStorage キー
  const STORAGE_KEY = 'nara_edu_my_timetable_v1';

  // アプリケーション状態
  const state = {
    semester: '前期', // メイン学期
    day: '月',
    slot: 1, // 1: 1・2限, 2: 3・4限, 3: 5・6限, 4: 7・8限, 5: 9・10限
    category: 'lecture', // 'all', 'lecture', etc.
    searchQuery: '',
    showOccupied: true,
    currentTab: 'free-rooms',
    selectedRoom: '101教室',
    matrixCategory: 'lecture',

    // 科目全件検索の状態
    lessonFilter: {
      q: '',
      sem: 'all',
      day: 'all',
      slot: 'all',
      cat: 'all'
    },
    lessonSort: {
      field: 'id',
      order: 'asc'
    },

    // My時間割の状態
    mySemester: '前期',
    myTimetable: {
      '前期': [],
      '後期': []
    }
  };

  // DOM要素
  const dom = {
    semBtns: document.querySelectorAll('.sem-btn'),
    navTabs: document.querySelectorAll('.nav-tab'),
    tabContents: document.querySelectorAll('.tab-content'),
    dayBtns: document.querySelectorAll('#day-selector .pill-btn'),
    slotBtns: document.querySelectorAll('#slot-selector .pill-btn'),
    categoryFilter: document.getElementById('category-filter'),
    roomSearchInput: document.getElementById('room-search-input'),
    showOccupiedToggle: document.getElementById('show-occupied-toggle'),
    roomsGrid: document.getElementById('rooms-grid'),
    countFree: document.getElementById('count-free'),
    countOccupied: document.getElementById('count-occupied'),
    countTotal: document.getElementById('count-total'),
    currentCriteriaLabel: document.getElementById('current-criteria-label'),
    btnNow: document.getElementById('btn-now'),

    // モーダル
    lessonModal: document.getElementById('lesson-modal'),
    modalLessonTitle: document.getElementById('modal-lesson-title'),
    modalLessonBody: document.getElementById('modal-lesson-body'),
    modalSyllabusLink: document.getElementById('modal-syllabus-link'),

    lessonSelectModal: document.getElementById('lesson-select-modal'),
    modalSelectTitle: document.getElementById('modal-select-title'),
    modalSelectDesc: document.getElementById('modal-select-desc'),
    modalSelectList: document.getElementById('modal-select-list'),

    // タイムテーブル
    timetableRoomSelect: document.getElementById('timetable-room-select'),
    quickRoomChips: document.getElementById('quick-room-chips'),
    timetableRoomName: document.getElementById('timetable-room-name'),
    timetableRoomCat: document.getElementById('timetable-room-cat'),
    timetableTbody: document.getElementById('timetable-tbody'),

    // マトリクス
    matrixCategorySelect: document.getElementById('matrix-category-select'),
    matrixTable: document.getElementById('matrix-table'),

    // 科目全件検索
    lessonSearchInput: document.getElementById('lesson-search-input'),
    lessonSemSelect: document.getElementById('lesson-sem-select'),
    lessonDaySelect: document.getElementById('lesson-day-select'),
    lessonSlotSelect: document.getElementById('lesson-slot-select'),
    lessonCatSelect: document.getElementById('lesson-cat-select'),
    btnLessonClear: document.getElementById('btn-lesson-clear'),
    lessonResultsCount: document.getElementById('lesson-results-count'),
    lessonTotalCount: document.getElementById('lesson-total-count'),
    lessonsTable: document.getElementById('lessons-table'),
    lessonsTbody: document.getElementById('lessons-tbody'),

    // My時間割
    myBadgeCount: document.getElementById('my-badge-count'),
    mySemBtns: document.querySelectorAll('.my-sem-btn'),
    myStatCount: document.getElementById('my-stat-count'),
    myStatCredits: document.getElementById('my-stat-credits'),
    myConflictAlert: document.getElementById('my-conflict-alert'),
    btnClearMyTimetable: document.getElementById('btn-clear-my-timetable'),
    myTimetableTbody: document.getElementById('my-timetable-tbody'),
    mySpecialCount: document.getElementById('my-special-count'),
    mySpecialList: document.getElementById('my-special-list')
  };

  // 人気講義室
  const POPULAR_ROOMS = ['101教室', '102教室', '105教室', '201教室', '206教室', '306教室', '310教室', '大講義室', '情報センター実習室（3F）'];

  // ----------------------------------------------------
  // LocalStorage: My時間割の保存・復元
  // ----------------------------------------------------
  function loadMyTimetable() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          state.myTimetable['前期'] = Array.isArray(parsed['前期']) ? parsed['前期'] : [];
          state.myTimetable['後期'] = Array.isArray(parsed['後期']) ? parsed['後期'] : [];
        }
      }
    } catch (e) {
      console.warn('My時間割のロードに失敗しました:', e);
    }
    updateMyBadge();
  }

  function saveMyTimetable() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.myTimetable));
    } catch (e) {
      console.warn('My時間割の保存に失敗しました:', e);
    }
    updateMyBadge();
  }

  function updateMyBadge() {
    if (!dom.myBadgeCount) return;
    const totalCount = (state.myTimetable['前期'] || []).length + (state.myTimetable['後期'] || []).length;
    dom.myBadgeCount.textContent = totalCount;
    dom.myBadgeCount.style.display = totalCount > 0 ? 'inline-flex' : 'none';
  }

  // 登録中か判定
  function isLessonInMyTimetable(lessonId) {
    const sem = state.mySemester;
    const list = state.myTimetable[sem] || [];
    return list.includes(lessonId);
  }

  // 追加/削除のトグル
  function toggleLessonInMyTimetable(lessonId) {
    const lesson = DATA.lessons.find(l => l.id === lessonId);
    if (!lesson) return;

    // 学期（通年の場合は現在のmySemesterに追加）
    let sem = state.mySemester;
    if (lesson.semester === '前期') sem = '前期';
    if (lesson.semester === '後期') sem = '後期';

    let list = state.myTimetable[sem] || [];
    const idx = list.indexOf(lessonId);

    if (idx >= 0) {
      list.splice(idx, 1);
      showToast(`「${lesson.name}」をMy時間割(${sem})から削除しました`);
    } else {
      list.push(lessonId);
      showToast(`「${lesson.name}」をMy時間割(${sem})に追加しました！ ⭐`);
    }

    state.myTimetable[sem] = list;
    saveMyTimetable();

    // 関連ビューを更新
    renderLessonsTab();
    renderMyTimetableTab();
  }

  // ----------------------------------------------------
  // データヘルパー関数
  // ----------------------------------------------------
  function getOccupyingLessons(semester, day, slot, roomName) {
    return DATA.lessons.filter(item => {
      const semMatch = (item.semester === semester || item.semester === '通年');
      if (!semMatch) return false;
      if (item.day !== day) return false;
      if (!item.slots || !Array.isArray(item.slots) || !item.slots.includes(slot)) return false;
      if (!item.rooms || !Array.isArray(item.rooms) || !item.rooms.includes(roomName)) return false;
      return true;
    });
  }

  function getRoomDaySchedule(semester, day, roomName) {
    const schedule = [];
    for (let s = 1; s <= 5; s++) {
      const lessons = getOccupyingLessons(semester, day, s, roomName);
      schedule.push({
        slot: s,
        isOccupied: lessons.length > 0,
        lessons: lessons
      });
    }
    return schedule;
  }

  function getCategoryName(key) {
    return (DATA.categories && DATA.categories[key]) ? DATA.categories[key] : 'その他';
  }

  function getSlotName(slotId) {
    const s = DATA.slots.find(item => item.id === slotId);
    return s ? `${s.name} (${s.time})` : `${slotId}限`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // 簡易トースト通知
  function showToast(msg) {
    let toast = document.getElementById('app-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'app-toast';
      toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        background: #0f172a;
        color: #fff;
        padding: 10px 20px;
        border-radius: 9999px;
        font-size: 0.875rem;
        font-weight: 600;
        box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3);
        z-index: 9999;
        transition: opacity 0.3s;
      `;
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    setTimeout(() => {
      toast.style.opacity = '0';
    }, 2500);
  }

  // ----------------------------------------------------
  // レンダリング: 空き教室を探す (TAB 1)
  // ----------------------------------------------------
  function renderFreeRoomsTab() {
    if (dom.currentCriteriaLabel) {
      dom.currentCriteriaLabel.textContent = `${state.semester} / ${state.day}曜日 / ${getSlotName(state.slot)}`;
    }

    let filteredRooms = DATA.rooms.filter(room => {
      if (state.category !== 'all' && room.category !== state.category) return false;
      if (state.searchQuery) {
        const query = state.searchQuery.toLowerCase();
        return room.name.toLowerCase().includes(query);
      }
      return true;
    });

    const roomStatuses = filteredRooms.map(room => {
      const occupiedLessons = getOccupyingLessons(state.semester, state.day, state.slot, room.name);
      const isOccupied = occupiedLessons.length > 0;
      const daySchedule = getRoomDaySchedule(state.semester, state.day, room.name);
      return {
        room: room,
        isOccupied: isOccupied,
        occupiedLessons: occupiedLessons,
        daySchedule: daySchedule
      };
    });

    const freeCount = roomStatuses.filter(r => !r.isOccupied).length;
    const occupiedCount = roomStatuses.filter(r => r.isOccupied).length;
    const totalCount = roomStatuses.length;

    if (dom.countFree) dom.countFree.textContent = freeCount;
    if (dom.countOccupied) dom.countOccupied.textContent = occupiedCount;
    if (dom.countTotal) dom.countTotal.textContent = totalCount;

    const displayRooms = state.showOccupied
      ? roomStatuses
      : roomStatuses.filter(r => !r.isOccupied);

    displayRooms.sort((a, b) => {
      if (a.isOccupied !== b.isOccupied) return a.isOccupied ? 1 : -1;
      return a.room.name.localeCompare(b.room.name, 'ja');
    });

    if (!dom.roomsGrid) return;
    dom.roomsGrid.innerHTML = '';

    if (displayRooms.length === 0) {
      dom.roomsGrid.innerHTML = `
        <div class="card" style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted);">
          <div style="font-size: 2rem; margin-bottom: 8px;">🔍</div>
          <p>該当する教室が見つかりませんでした。絞り込み条件を変更してください。</p>
        </div>
      `;
      return;
    }

    displayRooms.forEach(item => {
      const card = document.createElement('div');
      card.className = `room-card ${item.isOccupied ? 'status-occupied' : 'status-free'}`;

      const miniSlotsHtml = item.daySchedule.map(s => {
        const isCurrent = s.slot === state.slot;
        const cls = s.isOccupied ? 'is-occupied' : 'is-free';
        const currCls = isCurrent ? 'is-current' : '';
        const title = s.isOccupied
          ? `${s.slot}コマ目: 使用中 (${s.lessons.map(l => l.name).join(', ')})`
          : `${s.slot}コマ目: 空き`;
        return `
          <div class="mini-slot ${cls} ${currCls}" title="${escapeHtml(title)}">
            <span>${s.slot * 2 - 1}・${s.slot * 2}</span>
            <span>${s.isOccupied ? '×' : '〇'}</span>
          </div>
        `;
      }).join('');

      let occupiedDetailHtml = '';
      if (item.isOccupied) {
        const l = item.occupiedLessons[0];
        occupiedDetailHtml = `
          <div class="occupied-info">
            <div class="occupied-lesson-name">📖 ${escapeHtml(l.name)}</div>
            <div class="occupied-lesson-teacher">👨‍🏫 ${escapeHtml(l.teacher || '担当者記載なし')}</div>
          </div>
        `;
      } else {
        occupiedDetailHtml = `
          <div style="font-size: 0.825rem; color: var(--success); font-weight: 600;">
            ✅ この時間は自習・利用可能です
          </div>
        `;
      }

      card.innerHTML = `
        <div class="room-card-header">
          <div>
            <div class="room-title">${escapeHtml(item.room.name)}</div>
            <span class="room-category-badge">${getCategoryName(item.room.category)}</span>
          </div>
          <span class="status-pill ${item.isOccupied ? 'occupied' : 'free'}">
            ${item.isOccupied ? '使用中' : '空き教室'}
          </span>
        </div>

        ${occupiedDetailHtml}

        <div style="margin-top: 4px;">
          <div style="font-size: 0.725rem; color: var(--text-muted); margin-bottom: 2px;">
            ${state.day}曜日の終日状況:
          </div>
          <div class="day-slots-mini">
            ${miniSlotsHtml}
          </div>
        </div>
      `;

      card.addEventListener('click', () => {
        state.selectedRoom = item.room.name;
        if (dom.timetableRoomSelect) dom.timetableRoomSelect.value = item.room.name;
        switchTab('timetable');
      });

      dom.roomsGrid.appendChild(card);
    });
  }

  // ----------------------------------------------------
  // レンダリング: 教室別タイムテーブル (TAB 2)
  // ----------------------------------------------------
  function renderTimetableTab() {
    const roomName = state.selectedRoom || '101教室';
    if (dom.timetableRoomName) {
      dom.timetableRoomName.textContent = `${roomName} の週間利用状況 (${state.semester})`;
    }

    const roomObj = DATA.rooms.find(r => r.name === roomName);
    if (dom.timetableRoomCat) {
      dom.timetableRoomCat.textContent = roomObj ? getCategoryName(roomObj.category) : '教室';
    }

    document.querySelectorAll('.quick-chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.room === roomName);
    });

    if (!dom.timetableTbody) return;
    dom.timetableTbody.innerHTML = '';

    DATA.slots.forEach(slot => {
      const tr = document.createElement('tr');
      const tdTime = document.createElement('td');
      tdTime.className = 'time-col';
      tdTime.innerHTML = `<div>${escapeHtml(slot.name)}</div><span class="time-span">${escapeHtml(slot.time)}</span>`;
      tr.appendChild(tdTime);

      DATA.days.forEach(day => {
        const td = document.createElement('td');
        const occupying = getOccupyingLessons(state.semester, day, slot.id, roomName);

        if (occupying.length === 0) {
          td.className = 'timetable-cell is-free';
          td.innerHTML = `<span>🟢 空き</span>`;
        } else {
          td.className = 'timetable-cell is-occupied';
          td.innerHTML = occupying.map(lesson => `
            <div class="tt-lesson-item" data-lesson-id="${escapeHtml(lesson.id)}">
              <div class="tt-lesson-name">${escapeHtml(lesson.name)}</div>
              <div class="tt-lesson-meta">👨‍🏫 ${escapeHtml(lesson.teacher || '')}</div>
              <div class="tt-lesson-meta" style="font-size: 0.725rem; color: var(--text-muted);">${escapeHtml(lesson.id)} (${escapeHtml(lesson.credit || '')}単位)</div>
            </div>
          `).join('<hr style="margin: 6px 0; border: none; border-top: 1px dashed #cbd5e1;">');

          td.querySelectorAll('.tt-lesson-item').forEach((itemEl, idx) => {
            itemEl.addEventListener('click', (e) => {
              e.stopPropagation();
              openLessonModal(occupying[idx]);
            });
          });
        }

        tr.appendChild(td);
      });

      dom.timetableTbody.appendChild(tr);
    });
  }

  // ----------------------------------------------------
  // レンダリング: 全体稼働マトリクス (TAB 3)
  // ----------------------------------------------------
  function renderMatrixTab() {
    if (!dom.matrixTable) return;

    let filteredRooms = DATA.rooms.filter(room => {
      if (state.matrixCategory !== 'all' && room.category !== state.matrixCategory) return false;
      return true;
    });

    let html = `<thead><tr><th class="room-name-th">教室名 \\ 曜日・時限</th>`;
    DATA.days.forEach(day => {
      DATA.slots.forEach(slot => {
        html += `<th>${day}<br>${escapeHtml(slot.name.replace('限', ''))}</th>`;
      });
    });
    html += `</tr></thead><tbody>`;

    filteredRooms.forEach(room => {
      html += `<tr><th class="room-name-th">${escapeHtml(room.name)}</th>`;
      DATA.days.forEach(day => {
        DATA.slots.forEach(slot => {
          const occ = getOccupyingLessons(state.semester, day, slot.id, room.name);
          if (occ.length === 0) {
            html += `<td class="matrix-cell free" title="${escapeHtml(room.name)} ${day}曜 ${escapeHtml(slot.name)}: 空き">空</td>`;
          } else if (occ.length === 1) {
            const lesson = occ[0];
            const title = `${room.name} ${day}曜 ${slot.name}: ${lesson.name} (${lesson.teacher || ''})`;
            html += `<td class="matrix-cell occupied" title="${escapeHtml(title)}" onclick="window.__showLessonById('${escapeHtml(lesson.id)}')">${escapeHtml(lesson.name)}</td>`;
          } else {
            const count = occ.length;
            const names = occ.map(l => l.name).join(' / ');
            const title = `${room.name} ${day}曜 ${slot.name} [${count}件登録]: ${names} (クリックして科目を選択)`;
            html += `<td class="matrix-cell occupied multiple" title="${escapeHtml(title)}" onclick="window.__showLessonSelect('${escapeHtml(room.name)}', '${day}', ${slot.id})"><span class="badge-multi">[${count}件]</span>${escapeHtml(occ.map(l => l.name).join(' / '))}</td>`;
          }
        });
      });
      html += `</tr>`;
    });

    html += `</tbody>`;
    dom.matrixTable.innerHTML = html;
  }

  window.__showLessonById = function (id) {
    const l = DATA.lessons.find(item => item.id === id);
    if (l) openLessonModal(l);
  };

  window.__showLessonSelect = function (roomName, day, slotId) {
    const occ = getOccupyingLessons(state.semester, day, slotId, roomName);
    if (occ.length === 0) return;
    if (occ.length === 1) {
      openLessonModal(occ[0]);
      return;
    }
    openLessonSelectModal(roomName, day, slotId, occ);
  };

  function openLessonSelectModal(roomName, day, slotId, lessons) {
    if (!dom.lessonSelectModal || !dom.modalSelectTitle || !dom.modalSelectList) return;

    dom.modalSelectTitle.innerHTML = `
      <span>${escapeHtml(roomName)}</span>
      <span style="font-size: 0.85rem; font-weight: 500; color: var(--text-muted); margin-left: 8px;">(${escapeHtml(state.semester)} / ${escapeHtml(day)}曜 ${escapeHtml(getSlotName(slotId))})</span>
    `;

    if (dom.modalSelectDesc) {
      dom.modalSelectDesc.innerHTML = `
        このコマには <strong>${lessons.length} 件</strong> の科目が登録されています。詳細やシラバスを確認したい科目を選択してください：
      `;
    }

    dom.modalSelectList.innerHTML = '';
    lessons.forEach(l => {
      const card = document.createElement('div');
      card.className = 'lesson-select-card';
      card.innerHTML = `
        <div class="select-card-info">
          <div class="select-card-badges">
            <span class="select-id-badge">#${escapeHtml(l.id)}</span>
            <span class="badge">${escapeHtml(l.semester)}</span>
            <span class="badge" style="background: #e0f2fe; color: #0369a1;">${escapeHtml(l.credit || '-')}単位</span>
          </div>
          <div class="select-card-name">📖 ${escapeHtml(l.name)}</div>
          <div class="select-card-meta">
            <span class="select-meta-item">👨‍🏫 ${escapeHtml(l.teacher || '担当者記載なし')}</span>
            <span class="select-meta-item">⏱ ${escapeHtml(l.periodRaw || '')}</span>
            <span class="select-meta-item">🏢 ${escapeHtml((l.rooms || []).join(', ') || '教室未定')}</span>
          </div>
        </div>
        <div class="select-card-action">
          詳細・シラバス ➔
        </div>
      `;
      card.addEventListener('click', () => {
        dom.lessonSelectModal.classList.remove('show');
        openLessonModal(l);
      });
      dom.modalSelectList.appendChild(card);
    });

    dom.lessonSelectModal.classList.add('show');
  }

  // ----------------------------------------------------
  // レンダリング: 科目全件検索 (TAB 4)
  // ----------------------------------------------------
  function renderLessonsTab() {
    if (!dom.lessonsTbody) return;

    const f = state.lessonFilter;
    const q = f.q.toLowerCase();

    // フィルタリング
    let filtered = DATA.lessons.filter(l => {
      // 学期
      if (f.sem !== 'all' && l.semester !== f.sem) {
        if (f.sem === '前期' && l.semester !== '通年') return false;
        if (f.sem === '後期' && l.semester !== '通年') return false;
        if (f.sem === '通年' && l.semester !== '通年') return false;
      }

      // 曜日
      if (f.day !== 'all' && l.day !== f.day) return false;

      // 時限
      if (f.slot !== 'all') {
        const slotNum = parseInt(f.slot, 10);
        if (!l.slots || !l.slots.includes(slotNum)) return false;
      }

      // 教室区分
      if (f.cat !== 'all') {
        if (f.cat === 'online') {
          // オンライン判定
          const hasOnline = (l.rooms || []).includes('オンライン') || (l.name || '').includes('オンライン');
          if (!hasOnline) return false;
        } else {
          // 教室カテゴリに合致する部屋が1つでもあるか
          const matchCat = (l.rooms || []).some(roomName => {
            const rObj = DATA.rooms.find(r => r.name === roomName);
            return rObj && rObj.category === f.cat;
          });
          if (!matchCat) return false;
        }
      }

      // キーワード（科目名・教員名・教室・ID・評価方法テキスト）
      if (q) {
        const matchName = (l.name || '').toLowerCase().includes(q);
        const matchTeacher = (l.teacher || '').toLowerCase().includes(q);
        const matchRoom = (l.rooms || []).some(r => r.toLowerCase().includes(q));
        const matchId = (l.id || '').toLowerCase().includes(q);
        const matchEval = (l.eval || '').toLowerCase().includes(q);
        if (!matchName && !matchTeacher && !matchRoom && !matchId && !matchEval) return false;
      }

      return true;
    });

    // ソート処理
    const sortField = state.lessonSort.field;
    const sortOrder = state.lessonSort.order === 'desc' ? -1 : 1;

    filtered.sort((a, b) => {
      let valA, valB;
      if (sortField === 'id') {
        valA = a.id || '';
        valB = b.id || '';
      } else if (sortField === 'semester') {
        valA = a.semester || '';
        valB = b.semester || '';
      } else if (sortField === 'daySlot') {
        valA = `${a.day || ''}_${(a.slots || [])[0] || 99}`;
        valB = `${b.day || ''}_${(b.slots || [])[0] || 99}`;
      } else if (sortField === 'name') {
        valA = a.name || '';
        valB = b.name || '';
      } else if (sortField === 'rooms') {
        valA = (a.rooms || []).join(', ');
        valB = (b.rooms || []).join(', ');
      } else if (sortField === 'teacher') {
        valA = a.teacher || '';
        valB = b.teacher || '';
      } else if (sortField === 'credit') {
        valA = parseFloat(a.credit) || 0;
        valB = parseFloat(b.credit) || 0;
        return (valA - valB) * sortOrder;
      }
      return valA.localeCompare(valB, 'ja') * sortOrder;
    });

    // 件数更新
    if (dom.lessonResultsCount) dom.lessonResultsCount.textContent = filtered.length;
    if (dom.lessonTotalCount) dom.lessonTotalCount.textContent = DATA.lessons.length;

    // ソートヘッダーのUI更新
    document.querySelectorAll('.sortable-th').forEach(th => {
      const field = th.dataset.sort;
      const isActive = (field === state.lessonSort.field);
      th.classList.toggle('active', isActive);
      const icon = th.querySelector('.sort-icon');
      if (icon) {
        if (!isActive) {
          icon.textContent = '↕';
        } else {
          icon.textContent = state.lessonSort.order === 'asc' ? '▲' : '▼';
        }
      }
    });

    // 高速HTML生成（全件対応）
    let rowsHtml = '';
    const myLessonsPre = state.myTimetable['前期'] || [];
    const myLessonsPost = state.myTimetable['後期'] || [];

    filtered.forEach(l => {
      const isAdded = myLessonsPre.includes(l.id) || myLessonsPost.includes(l.id);
      const cleanId = (l.id || '').trim().startsWith('G') ? l.id : `G${l.id}`;
      const syllabusUrl = `https://www.nara-edu.ac.jp/ADMIN/KYOUMU/SYLLABUS/syllabus/2026/detail/2026_01_${cleanId}.html`;

      rowsHtml += `
        <tr data-lesson-id="${escapeHtml(l.id)}">
          <td style="text-align: center;">
            <button type="button" class="btn-star ${isAdded ? 'is-added' : ''}" onclick="window.__toggleMyLesson('${escapeHtml(l.id)}', event)" title="${isAdded ? 'My時間割から削除' : 'My時間割に追加'}">
              ${isAdded ? '★' : '☆'}
            </button>
          </td>
          <td style="font-family: monospace; font-weight: 600;">${escapeHtml(l.id)}</td>
          <td><span class="badge">${escapeHtml(l.semester)}</span></td>
          <td><strong>${escapeHtml(l.day || '')}</strong> ${escapeHtml(l.periodRaw || '')}</td>
          <td style="font-weight: 600; color: #1e40af; cursor: pointer;" onclick="window.__showLessonById('${escapeHtml(l.id)}')">${escapeHtml(l.name)}</td>
          <td>${escapeHtml((l.rooms || []).join(', '))}</td>
          <td>${escapeHtml(l.teacher || '')}</td>
          <td style="text-align: center;">${escapeHtml(l.credit || '')}</td>
          <td style="text-align: center;">
            <a href="${escapeHtml(syllabusUrl)}" target="_blank" rel="noopener noreferrer" class="btn-syllabus-mini" title="シラバスを開く" onclick="event.stopPropagation();">
              🔗
            </a>
          </td>
        </tr>
      `;
    });

    dom.lessonsTbody.innerHTML = rowsHtml || `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 40px;">該当する科目が見つかりませんでした。条件を変更してください。</td></tr>`;
  }

  window.__toggleMyLesson = function (lessonId, event) {
    if (event) event.stopPropagation();
    toggleLessonInMyTimetable(lessonId);
  };

  // ----------------------------------------------------
  // レンダリング: My時間割 (TAB 5)
  // ----------------------------------------------------
  function renderMyTimetableTab() {
    if (!dom.myTimetableTbody) return;

    const currentSem = state.mySemester;
    const lessonIds = state.myTimetable[currentSem] || [];
    const registeredLessons = lessonIds.map(id => DATA.lessons.find(l => l.id === id)).filter(Boolean);

    // 統計計算
    let totalCredits = 0;
    registeredLessons.forEach(l => {
      const cr = parseFloat(l.credit) || 0;
      totalCredits += cr;
    });

    if (dom.myStatCount) dom.myStatCount.textContent = registeredLessons.length;
    if (dom.myStatCredits) dom.myStatCredits.textContent = totalCredits;

    // 学期ボタンのUI更新
    dom.mySemBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mySem === currentSem);
    });

    // スロット配置の辞書作成 & 重複検出
    // slotMap: { "月_1": [lesson1, lesson2] }
    const slotMap = {};
    const specialLessons = []; // 集中講義など
    let hasConflict = false;

    registeredLessons.forEach(l => {
      if (l.day === '集中' || !l.slots || l.slots.length === 0) {
        specialLessons.push(l);
      } else {
        l.slots.forEach(s => {
          const key = `${l.day}_${s}`;
          if (!slotMap[key]) slotMap[key] = [];
          slotMap[key].push(l);
          if (slotMap[key].length > 1) {
            hasConflict = true;
          }
        });
      }
    });

    if (dom.myConflictAlert) {
      dom.myConflictAlert.style.display = hasConflict ? 'block' : 'none';
    }

    // テーブル生成
    dom.myTimetableTbody.innerHTML = '';
    DATA.slots.forEach(slot => {
      const tr = document.createElement('tr');
      const tdTime = document.createElement('td');
      tdTime.className = 'time-col';
      tdTime.innerHTML = `<div>${escapeHtml(slot.name)}</div><span class="time-span">${escapeHtml(slot.time)}</span>`;
      tr.appendChild(tdTime);

      DATA.days.forEach(day => {
        const td = document.createElement('td');
        const key = `${day}_${slot.id}`;
        const lessons = slotMap[key] || [];

        if (lessons.length === 0) {
          td.className = 'timetable-cell is-empty';
          td.innerHTML = `<span style="color: var(--text-muted); font-size: 0.75rem;">—</span>`;
        } else {
          td.className = 'timetable-cell my-tt-cell';
          const isConflict = lessons.length > 1;

          td.innerHTML = lessons.map(l => {
            const cleanId = (l.id || '').trim().startsWith('G') ? l.id : `G${l.id}`;
            const syllabusUrl = `https://www.nara-edu.ac.jp/ADMIN/KYOUMU/SYLLABUS/syllabus/2026/detail/2026_01_${cleanId}.html`;

            return `
              <div class="my-lesson-card ${isConflict ? 'is-conflict' : ''}">
                <div class="my-lesson-title" onclick="window.__showLessonById('${escapeHtml(l.id)}')">
                  ${isConflict ? '⚠️ ' : ''}${escapeHtml(l.name)}
                </div>
                <div class="my-lesson-details">
                  <span>🏢 ${escapeHtml((l.rooms || []).join(', ') || '未定')}</span>
                  <span>👨‍🏫 ${escapeHtml(l.teacher || '')} (${escapeHtml(l.credit || '-')}単位)</span>
                </div>
                <div class="my-lesson-actions">
                  <a href="${escapeHtml(syllabusUrl)}" target="_blank" rel="noopener noreferrer" style="font-size: 0.725rem; color: var(--primary);">シラバス ↗</a>
                  <button type="button" class="my-del-btn" onclick="window.__toggleMyLesson('${escapeHtml(l.id)}', event)">🗑️ 削除</button>
                </div>
              </div>
            `;
          }).join('');
        }

        tr.appendChild(td);
      });

      dom.myTimetableTbody.appendChild(tr);
    });

    // 集中講義・その他登録リスト
    if (dom.mySpecialCount) dom.mySpecialCount.textContent = specialLessons.length;
    if (dom.mySpecialList) {
      if (specialLessons.length === 0) {
        dom.mySpecialList.innerHTML = `<div class="empty-hint">集中講義などの登録科目はありません。</div>`;
      } else {
        dom.mySpecialList.innerHTML = specialLessons.map(l => {
          const cleanId = (l.id || '').trim().startsWith('G') ? l.id : `G${l.id}`;
          const syllabusUrl = `https://www.nara-edu.ac.jp/ADMIN/KYOUMU/SYLLABUS/syllabus/2026/detail/2026_01_${cleanId}.html`;

          return `
            <div class="card my-lesson-card" style="margin: 0;">
              <div class="my-lesson-title" onclick="window.__showLessonById('${escapeHtml(l.id)}')">
                📌 ${escapeHtml(l.name)}
              </div>
              <div class="my-lesson-details" style="margin-top: 4px;">
                <span>開講: ${escapeHtml(l.semester)} / ${escapeHtml(l.day || '')} (${escapeHtml(l.credit || '-')}単位)</span>
                <span>担当: ${escapeHtml(l.teacher || '未定')}</span>
              </div>
              <div class="my-lesson-actions" style="margin-top: 8px;">
                <a href="${escapeHtml(syllabusUrl)}" target="_blank" rel="noopener noreferrer" style="font-size: 0.75rem; color: var(--primary);">シラバス ↗</a>
                <button type="button" class="my-del-btn" onclick="window.__toggleMyLesson('${escapeHtml(l.id)}', event)">🗑️ 削除</button>
              </div>
            </div>
          `;
        }).join('');
      }
    }
  }

  // ----------------------------------------------------
  // モーダル: 講義詳細
  // ----------------------------------------------------
  function openLessonModal(lesson) {
    if (!dom.modalLessonTitle || !dom.modalLessonBody || !dom.lessonModal) return;

    const rawId = (lesson && lesson.id) ? String(lesson.id).trim() : '';
    const formattedId = rawId.startsWith('G') ? rawId : `G${rawId}`;
    const syllabusUrl = formattedId
      ? `https://www.nara-edu.ac.jp/ADMIN/KYOUMU/SYLLABUS/syllabus/2026/detail/2026_01_${formattedId}.html`
      : 'https://www.nara-edu.ac.jp/ADMIN/KYOUMU/SYLLABUS/syllabus/2026/';

    const syllabusLink = document.getElementById('modal-syllabus-link') || dom.modalSyllabusLink;
    if (syllabusLink) {
      syllabusLink.href = syllabusUrl;
      syllabusLink.setAttribute('href', syllabusUrl);
      syllabusLink.onclick = function (e) {
        e.stopPropagation();
        window.open(syllabusUrl, '_blank');
        return false;
      };
    }

    const isAdded = isLessonInMyTimetable(lesson.id);

    dom.modalLessonTitle.textContent = lesson.name;
    dom.modalLessonBody.innerHTML = `
      <div class="detail-grid">
        <div class="detail-item">
          <div class="detail-item-label">時間割番号</div>
          <div class="detail-item-val">${escapeHtml(lesson.id)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-item-label">開講区分・単位</div>
          <div class="detail-item-val">${escapeHtml(lesson.semester)} / ${escapeHtml(lesson.credit || '-')} 単位</div>
        </div>
        <div class="detail-item">
          <div class="detail-item-label">日時</div>
          <div class="detail-item-val">${escapeHtml(lesson.day)}曜 ${escapeHtml(lesson.periodRaw)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-item-label">使用教室</div>
          <div class="detail-item-val" style="color: var(--primary); font-weight: 700;">
            ${escapeHtml((lesson.rooms || []).join(', ') || '指定なし')}
          </div>
        </div>
        <div class="detail-item" style="grid-column: 1 / -1;">
          <div class="detail-item-label">担当教員</div>
          <div class="detail-item-val">${escapeHtml(lesson.teacher || '記載なし')}</div>
        </div>
      </div>

      <div>
        <div class="detail-item-label" style="margin-bottom: 6px;">成績評価方法・シラバス備考</div>
        <div class="eval-box">${escapeHtml(lesson.eval || 'シラバスに評価方法の記載がありません。')}</div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; flex-wrap: wrap; gap: 8px;">
        <button type="button" class="btn-star-modal ${isAdded ? 'is-added' : ''}" id="btn-modal-star">
          ${isAdded ? '★ My時間割から削除' : '☆ My時間割に追加'}
        </button>

        <button type="button" class="btn btn-primary" id="btn-modal-view-room" style="font-size: 0.85rem;">
          この教室の時間割を見る ➔
        </button>
      </div>
    `;

    document.getElementById('btn-modal-star').addEventListener('click', () => {
      toggleLessonInMyTimetable(lesson.id);
      openLessonModal(lesson); // 再描画
    });

    document.getElementById('btn-modal-view-room').addEventListener('click', () => {
      dom.lessonModal.classList.remove('show');
      if (lesson.rooms && lesson.rooms.length > 0) {
        state.selectedRoom = lesson.rooms[0];
        if (dom.timetableRoomSelect) dom.timetableRoomSelect.value = lesson.rooms[0];
        switchTab('timetable');
      }
    });

    dom.lessonModal.classList.add('show');
  }

  // ----------------------------------------------------
  // 「今すぐ使える教室」クイックジャンプ判定
  // ----------------------------------------------------
  function jumpToCurrentSlot() {
    const now = new Date();
    const dayMap = ['日', '月', '火', '水', '木', '金', '土'];
    const currentDay = dayMap[now.getDay()];

    const hours = now.getHours();
    const minutes = now.getMinutes();
    const currentMinutes = hours * 60 + minutes;

    let determinedSlot = 1;
    if (currentMinutes < 635) {
      determinedSlot = 1;
    } else if (currentMinutes < 750) {
      determinedSlot = 2;
    } else if (currentMinutes < 875) {
      determinedSlot = 3;
    } else if (currentMinutes < 975) {
      determinedSlot = 4;
    } else {
      determinedSlot = 5;
    }

    if (['月', '火', '水', '木', '金'].includes(currentDay)) {
      state.day = currentDay;
    } else {
      state.day = '月';
    }
    state.slot = determinedSlot;

    const month = now.getMonth() + 1;
    state.semester = (month >= 4 && month <= 9) ? '前期' : '後期';

    updateUISelectors();
    switchTab('free-rooms');
    renderFreeRoomsTab();

    showToast(`現在時刻（${state.semester}・${state.day}曜 ${getSlotName(state.slot)}）に切り替えました！`);
  }

  function updateUISelectors() {
    dom.semBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.sem === state.semester);
    });
    dom.dayBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.day === state.day);
    });
    dom.slotBtns.forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.slot, 10) === state.slot);
    });
  }

  // タブ切り替え
  function switchTab(tabId) {
    state.currentTab = tabId;
    dom.navTabs.forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tabId);
    });
    dom.tabContents.forEach(c => {
      c.classList.toggle('active', c.id === `tab-${tabId}`);
    });

    if (tabId === 'free-rooms') renderFreeRoomsTab();
    if (tabId === 'timetable') renderTimetableTab();
    if (tabId === 'matrix') renderMatrixTab();
    if (tabId === 'lessons') renderLessonsTab();
    if (tabId === 'my-timetable') renderMyTimetableTab();
  }

  // ----------------------------------------------------
  // イベントリスナーの登録
  // ----------------------------------------------------
  function initEvents() {
    // 学期切り替え
    dom.semBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        state.semester = btn.dataset.sem;
        updateUISelectors();
        if (state.currentTab === 'free-rooms') renderFreeRoomsTab();
        if (state.currentTab === 'timetable') renderTimetableTab();
        if (state.currentTab === 'matrix') renderMatrixTab();
      });
    });

    // ナビゲーションタブ
    dom.navTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        switchTab(tab.dataset.tab);
      });
    });

    // 曜日ボタン
    dom.dayBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        state.day = btn.dataset.day;
        updateUISelectors();
        renderFreeRoomsTab();
      });
    });

    // 時限スロットボタン
    dom.slotBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        state.slot = parseInt(btn.dataset.slot, 10);
        updateUISelectors();
        renderFreeRoomsTab();
      });
    });

    // カテゴリフィルター
    if (dom.categoryFilter) {
      dom.categoryFilter.addEventListener('change', (e) => {
        state.category = e.target.value;
        renderFreeRoomsTab();
      });
    }

    // 教室検索インプット
    if (dom.roomSearchInput) {
      dom.roomSearchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.trim();
        renderFreeRoomsTab();
      });
    }

    // 使用中の教室も表示トグル
    if (dom.showOccupiedToggle) {
      dom.showOccupiedToggle.addEventListener('change', (e) => {
        state.showOccupied = e.target.checked;
        renderFreeRoomsTab();
      });
    }

    // 「今すぐ使える教室」ボタン
    if (dom.btnNow) {
      dom.btnNow.addEventListener('click', jumpToCurrentSlot);
    }

    // モーダル閉じるボタン
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (dom.lessonModal) dom.lessonModal.classList.remove('show');
        if (dom.lessonSelectModal) dom.lessonSelectModal.classList.remove('show');
      });
    });

    // モーダル背景クリック
    [dom.lessonModal, dom.lessonSelectModal].forEach(modal => {
      if (modal) {
        modal.addEventListener('click', (e) => {
          if (e.target === modal) {
            modal.classList.remove('show');
          }
        });
      }
    });

    // タイムテーブル教室セレクト
    if (dom.timetableRoomSelect) {
      dom.timetableRoomSelect.addEventListener('change', (e) => {
        state.selectedRoom = e.target.value;
        renderTimetableTab();
      });
    }

    // マトリクスカテゴリセレクト
    if (dom.matrixCategorySelect) {
      dom.matrixCategorySelect.addEventListener('change', (e) => {
        state.matrixCategory = e.target.value;
        renderMatrixTab();
      });
    }

    // --- 科目全件検索イベント ---
    if (dom.lessonSearchInput) {
      dom.lessonSearchInput.addEventListener('input', (e) => {
        state.lessonFilter.q = e.target.value.trim();
        renderLessonsTab();
      });
    }

    if (dom.lessonSemSelect) {
      dom.lessonSemSelect.addEventListener('change', (e) => {
        state.lessonFilter.sem = e.target.value;
        renderLessonsTab();
      });
    }

    if (dom.lessonDaySelect) {
      dom.lessonDaySelect.addEventListener('change', (e) => {
        state.lessonFilter.day = e.target.value;
        renderLessonsTab();
      });
    }

    if (dom.lessonSlotSelect) {
      dom.lessonSlotSelect.addEventListener('change', (e) => {
        state.lessonFilter.slot = e.target.value;
        renderLessonsTab();
      });
    }

    if (dom.lessonCatSelect) {
      dom.lessonCatSelect.addEventListener('change', (e) => {
        state.lessonFilter.cat = e.target.value;
        renderLessonsTab();
      });
    }

    if (dom.btnLessonClear) {
      dom.btnLessonClear.addEventListener('click', () => {
        state.lessonFilter = { q: '', sem: 'all', day: 'all', slot: 'all', cat: 'all' };
        if (dom.lessonSearchInput) dom.lessonSearchInput.value = '';
        if (dom.lessonSemSelect) dom.lessonSemSelect.value = 'all';
        if (dom.lessonDaySelect) dom.lessonDaySelect.value = 'all';
        if (dom.lessonSlotSelect) dom.lessonSlotSelect.value = 'all';
        if (dom.lessonCatSelect) dom.lessonCatSelect.value = 'all';
        renderLessonsTab();
        showToast('検索条件をクリアしました');
      });
    }

    // テーブルソートイベント
    document.querySelectorAll('.sortable-th').forEach(th => {
      th.addEventListener('click', () => {
        const field = th.dataset.sort;
        if (state.lessonSort.field === field) {
          state.lessonSort.order = (state.lessonSort.order === 'asc') ? 'desc' : 'asc';
        } else {
          state.lessonSort.field = field;
          state.lessonSort.order = 'asc';
        }
        renderLessonsTab();
      });
    });

    // --- My時間割イベント ---
    dom.mySemBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        state.mySemester = btn.dataset.mySem;
        renderMyTimetableTab();
      });
    });

    if (dom.btnClearMyTimetable) {
      dom.btnClearMyTimetable.addEventListener('click', () => {
        const sem = state.mySemester;
        if (confirm(`本当に${sem}のMy時間割をすべてリセットしますか？`)) {
          state.myTimetable[sem] = [];
          saveMyTimetable();
          renderMyTimetableTab();
          renderLessonsTab();
          showToast(`${sem}のMy時間割をリセットしました`);
        }
      });
    }
  }

  // ----------------------------------------------------
  // 初期化
  // ----------------------------------------------------
  function init() {
    // 教室セレクトボックスの構築
    if (dom.timetableRoomSelect) {
      dom.timetableRoomSelect.innerHTML = '';
      DATA.rooms.forEach(room => {
        const opt = document.createElement('option');
        opt.value = room.name;
        opt.textContent = `${room.name} (${getCategoryName(room.category)})`;
        dom.timetableRoomSelect.appendChild(opt);
      });
    }

    // クイック教室チップの構築
    if (dom.quickRoomChips) {
      dom.quickRoomChips.innerHTML = '';
      POPULAR_ROOMS.forEach(rName => {
        if (DATA.rooms.some(r => r.name === rName)) {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'quick-chip';
          chip.dataset.room = rName;
          chip.textContent = rName;
          chip.addEventListener('click', () => {
            state.selectedRoom = rName;
            if (dom.timetableRoomSelect) dom.timetableRoomSelect.value = rName;
            renderTimetableTab();
          });
          dom.quickRoomChips.appendChild(chip);
        }
      });
    }

    // My時間割をLocalStorageからロード
    loadMyTimetable();

    // 初期学期を「前期」に明示設定
    state.semester = '前期';
    state.mySemester = '前期';

    updateUISelectors();
    initEvents();

    // 初回レンダリング
    renderFreeRoomsTab();
    renderTimetableTab();
    renderMatrixTab();
    renderLessonsTab();
    renderMyTimetableTab();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
