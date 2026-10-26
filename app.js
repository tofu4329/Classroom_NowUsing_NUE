/**
 * 奈良教育大学 空き教室・利用状況チェッカー
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

  // 重要：データ正規化（JSONシリアライズ時に1要素配列がスカラー化していた場合の防御的変換）
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

  // アプリケーション状態
  const state = {
    semester: '前期', // 初期値は前期
    day: '月',
    slot: 1, // 1: 1・2限, 2: 3・4限, 3: 5・6限, 4: 7・8限, 5: 9・10限
    category: 'lecture', // 'all', 'lecture', 'info', 'lab', etc.
    searchQuery: '',
    showOccupied: true,
    currentTab: 'free-rooms',
    selectedRoom: '101教室',
    matrixCategory: 'lecture',
    lessonSearchQuery: '',
    lessonSearchDay: 'all'
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
    lessonModal: document.getElementById('lesson-modal'),
    modalLessonTitle: document.getElementById('modal-lesson-title'),
    modalLessonBody: document.getElementById('modal-lesson-body'),
    timetableRoomSelect: document.getElementById('timetable-room-select'),
    quickRoomChips: document.getElementById('quick-room-chips'),
    timetableRoomName: document.getElementById('timetable-room-name'),
    timetableRoomCat: document.getElementById('timetable-room-cat'),
    timetableTbody: document.getElementById('timetable-tbody'),
    matrixCategorySelect: document.getElementById('matrix-category-select'),
    matrixTable: document.getElementById('matrix-table'),
    lessonSearchInput: document.getElementById('lesson-search-input'),
    lessonDaySelect: document.getElementById('lesson-day-select'),
    lessonResultsCount: document.getElementById('lesson-results-count'),
    lessonsTbody: document.getElementById('lessons-tbody')
  };

  // 人気・主要講義室リスト
  const POPULAR_ROOMS = ['101教室', '102教室', '105教室', '201教室', '206教室', '306教室', '310教室', '大講義室', '情報センター実習室（3F）'];

  // ----------------------------------------------------
  // データヘルパー関数
  // ----------------------------------------------------

  // 指定した学期・曜日・時限スロット・教室で使用されている講義を取得
  function getOccupyingLessons(semester, day, slot, roomName) {
    return DATA.lessons.filter(item => {
      // 学期判定（通年は前期・後期の両方に適用）
      const semMatch = (item.semester === semester || item.semester === '通年');
      if (!semMatch) return false;

      // 曜日判定
      if (item.day !== day) return false;

      // 時限スロット判定
      if (!item.slots || !Array.isArray(item.slots) || !item.slots.includes(slot)) return false;

      // 教室判定
      if (!item.rooms || !Array.isArray(item.rooms) || !item.rooms.includes(roomName)) return false;

      return true;
    });
  }

  // 指定した教室のその日の全スロット（1〜5）の使用状況
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

  // カテゴリ名称
  function getCategoryName(key) {
    return (DATA.categories && DATA.categories[key]) ? DATA.categories[key] : 'その他';
  }

  // スロット名称
  function getSlotName(slotId) {
    const s = DATA.slots.find(item => item.id === slotId);
    return s ? `${s.name} (${s.time})` : `${slotId}限`;
  }

  // ----------------------------------------------------
  // レンダリング: 空き教室を探す (TAB 1)
  // ----------------------------------------------------
  function renderFreeRoomsTab() {
    if (dom.currentCriteriaLabel) {
      dom.currentCriteriaLabel.textContent = `${state.semester} / ${state.day}曜日 / ${getSlotName(state.slot)}`;
    }

    // 教室フィルタリング
    let filteredRooms = DATA.rooms.filter(room => {
      if (state.category !== 'all' && room.category !== state.category) {
        return false;
      }
      if (state.searchQuery) {
        const query = state.searchQuery.toLowerCase();
        return room.name.toLowerCase().includes(query);
      }
      return true;
    });

    // 教室ごとの現在の状態を取得
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

    // カウント集計
    const freeCount = roomStatuses.filter(r => !r.isOccupied).length;
    const occupiedCount = roomStatuses.filter(r => r.isOccupied).length;
    const totalCount = roomStatuses.length;

    if (dom.countFree) dom.countFree.textContent = freeCount;
    if (dom.countOccupied) dom.countOccupied.textContent = occupiedCount;
    if (dom.countTotal) dom.countTotal.textContent = totalCount;

    // 表示する部屋（空き教室のみか、使用中も含めるか）
    const displayRooms = state.showOccupied
      ? roomStatuses
      : roomStatuses.filter(r => !r.isOccupied);

    // 空き教室を先に、使用中を後ろにソート
    displayRooms.sort((a, b) => {
      if (a.isOccupied !== b.isOccupied) {
        return a.isOccupied ? 1 : -1;
      }
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

      // ミニタイムラインHTML
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

      // 使用中講義情報
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

      // カードクリックで「教室別タイムテーブル」へジャンプ
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

    // クイックチップのアクティブ状態更新
    document.querySelectorAll('.quick-chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.room === roomName);
    });

    if (!dom.timetableTbody) return;
    dom.timetableTbody.innerHTML = '';

    DATA.slots.forEach(slot => {
      const tr = document.createElement('tr');

      // 時限カラム
      const tdTime = document.createElement('td');
      tdTime.className = 'time-col';
      tdTime.innerHTML = `<div>${escapeHtml(slot.name)}</div><span class="time-span">${escapeHtml(slot.time)}</span>`;
      tr.appendChild(tdTime);

      // 月〜金
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

          // クリックでシラバス詳細モーダルを表示
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
      if (state.matrixCategory !== 'all' && room.category !== state.matrixCategory) {
        return false;
      }
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
          } else {
            const lesson = occ[0];
            const title = `${room.name} ${day}曜 ${slot.name}: ${lesson.name} (${lesson.teacher || ''})`;
            html += `<td class="matrix-cell occupied" title="${escapeHtml(title)}" onclick="window.__showLessonById('${escapeHtml(lesson.id)}')">${escapeHtml(lesson.name)}</td>`;
          }
        });
      });
      html += `</tr>`;
    });

    html += `</tbody>`;
    dom.matrixTable.innerHTML = html;
  }

  // マトリクス用のグローバル関数
  window.__showLessonById = function (id) {
    const l = DATA.lessons.find(item => item.id === id);
    if (l) openLessonModal(l);
  };

  // ----------------------------------------------------
  // レンダリング: 講義一覧・検索 (TAB 4)
  // ----------------------------------------------------
  function renderLessonsTab() {
    const q = state.lessonSearchQuery.toLowerCase();
    const dayFilter = dom.lessonDaySelect ? dom.lessonDaySelect.value : 'all';

    const filtered = DATA.lessons.filter(l => {
      // 学期
      if (l.semester !== state.semester && l.semester !== '通年') return false;

      // 曜日
      if (dayFilter !== 'all' && l.day !== dayFilter) return false;

      // 検索キーワード
      if (q) {
        const matchName = (l.name || '').toLowerCase().includes(q);
        const matchTeacher = (l.teacher || '').toLowerCase().includes(q);
        const matchRoom = (l.rooms || []).some(r => r.toLowerCase().includes(q));
        const matchId = (l.id || '').toLowerCase().includes(q);
        if (!matchName && !matchTeacher && !matchRoom && !matchId) return false;
      }

      return true;
    });

    if (dom.lessonResultsCount) dom.lessonResultsCount.textContent = filtered.length;
    if (!dom.lessonsTbody) return;
    dom.lessonsTbody.innerHTML = '';

    const maxShow = 200; // パフォーマンスのため上限
    const showList = filtered.slice(0, maxShow);

    showList.forEach(l => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family: monospace; font-weight: 600;">${escapeHtml(l.id)}</td>
        <td><span class="badge">${escapeHtml(l.semester)}</span></td>
        <td><strong>${escapeHtml(l.day || '')}</strong> ${escapeHtml(l.periodRaw || '')}</td>
        <td style="font-weight: 600; color: #1e40af;">${escapeHtml(l.name)}</td>
        <td>${escapeHtml((l.rooms || []).join(', '))}</td>
        <td>${escapeHtml(l.teacher || '')}</td>
        <td>${escapeHtml(l.credit || '')}</td>
      `;
      tr.addEventListener('click', () => openLessonModal(l));
      dom.lessonsTbody.appendChild(tr);
    });

    if (filtered.length > maxShow) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="7" style="text-align: center; color: var(--text-muted); padding: 16px;">他 ${filtered.length - maxShow} 件省略（検索語で絞り込んでください）</td>`;
      dom.lessonsTbody.appendChild(tr);
    }
  }

  // ----------------------------------------------------
  // モーダル: 講義詳細
  // ----------------------------------------------------
  function openLessonModal(lesson) {
    if (!dom.modalLessonTitle || !dom.modalLessonBody || !dom.lessonModal) return;

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

      <div style="display: flex; justify-content: flex-end; margin-top: 8px;">
        <button type="button" class="btn btn-primary" id="btn-modal-view-room" style="font-size: 0.85rem;">
          この教室の時間割を見る ➔
        </button>
      </div>
    `;

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

    // 平日判定
    if (['月', '火', '水', '木', '金'].includes(currentDay)) {
      state.day = currentDay;
    } else {
      state.day = '月';
    }
    state.slot = determinedSlot;

    // 現在の月（4〜9月なら前期、10〜3月なら後期）
    const month = now.getMonth() + 1;
    state.semester = (month >= 4 && month <= 9) ? '前期' : '後期';

    updateUISelectors();
    switchTab('free-rooms');
    renderFreeRoomsTab();

    showToast(`現在時刻（${state.semester}・${state.day}曜 ${getSlotName(state.slot)}）に切り替えました！`);
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

  // セレクターのUI更新
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
  }

  // HTMLエスケープ
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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
        if (state.currentTab === 'lessons') renderLessonsTab();
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
      });
    });

    // モーダル背景クリック
    if (dom.lessonModal) {
      dom.lessonModal.addEventListener('click', (e) => {
        if (e.target === dom.lessonModal) {
          dom.lessonModal.classList.remove('show');
        }
      });
    }

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

    // 講義検索
    if (dom.lessonSearchInput) {
      dom.lessonSearchInput.addEventListener('input', (e) => {
        state.lessonSearchQuery = e.target.value.trim();
        renderLessonsTab();
      });
    }

    if (dom.lessonDaySelect) {
      dom.lessonDaySelect.addEventListener('change', () => {
        renderLessonsTab();
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

    // 初期学期を「前期」に明示設定（HTMLボタンのactiveと一致）
    state.semester = '前期';

    updateUISelectors();
    initEvents();

    // 初回レンダリング
    renderFreeRoomsTab();
    renderTimetableTab();
    renderMatrixTab();
    renderLessonsTab();
  }

  // DOMContentLoaded または即時実行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
