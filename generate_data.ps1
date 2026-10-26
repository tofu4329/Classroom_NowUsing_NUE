[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$csvPath = 'C:\Users\Hyobu\.gemini\antigravity\scratch\classroom-finder\syllabus.csv'
$data = Import-Csv -Path $csvPath -Encoding utf8
$cols = $data[0].psobject.Properties.Name

function Get-RoomCategory($room) {
    if ($room -match '^[123]\d\d' -or $room -eq '大講義室' -or $room -match 'サテライト') {
        return 'lecture'
    }
    if ($room -match '情報センター') {
        return 'info'
    }
    if ($room -match '実験室' -or $room -eq '農場' -or $room -eq '脳波室') {
        return 'lab'
    }
    if ($room -match '絵画' -or $room -match '彫塑' -or $room -match '陶芸' -or $room -match '金属' -or $room -match '木材' -or $room -match '技術棟' -or $room -match '書道' -or $room -match '美術' -or $room -match '調理' -or $room -match '被服' -or $room -match '保育') {
        return 'art'
    }
    if ($room -match '音楽' -or $room -match 'ピアノ') {
        return 'music'
    }
    if ($room -match '体育館' -or $room -match '運動場' -or $room -match 'テニス' -or $room -match '武道場' -or $room -match '柔道場' -or $room -match '剣道場' -or $room -match '舞踊場' -or $room -match 'プール' -or $room -match '山田ホール') {
        return 'sports'
    }
    return 'other'
}

$allRoomsMap = @{}
$lessons = @()

foreach ($row in $data) {
    $sem = $row.($cols[1])
    $subj = $row.($cols[2])
    $day = $row.($cols[3])
    $period = $row.($cols[4])
    $roomRaw = $row.($cols[5])
    $teacher = $row.($cols[8])
    $id = $row.($cols[0])
    $credit = $row.($cols[6])
    $eval = $row.($cols[7])

    if (-not $roomRaw -or $roomRaw.Trim() -eq '' -or $roomRaw -eq 'オンライン') {
        continue
    }

    $roomSplit = @($roomRaw -split '[,、]' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' -and $_ -ne 'オンライン' })
    foreach ($r in $roomSplit) {
        if (-not $allRoomsMap.ContainsKey($r)) {
            $allRoomsMap[$r] = @{
                name = $r
                category = Get-RoomCategory $r
            }
        }
    }

    $periodNums = @()
    if ($period) {
        $matches = [regex]::Matches($period, '\d+')
        foreach ($m in $matches) {
            $periodNums += [int]$m.Value
        }
    }

    $slots = @()
    if ($periodNums -contains 1 -or $periodNums -contains 2) { $slots += 1 }
    if ($periodNums -contains 3 -or $periodNums -contains 4) { $slots += 2 }
    if ($periodNums -contains 5 -or $periodNums -contains 6) { $slots += 3 }
    if ($periodNums -contains 7 -or $periodNums -contains 8) { $slots += 4 }
    if ($periodNums -contains 9 -or $periodNums -contains 10) { $slots += 5 }
    $slots = @($slots | Select-Object -Unique)

    $lessons += [PSCustomObject]@{
        id = $id
        semester = $sem
        name = $subj
        day = $day
        periodRaw = $period
        periodNums = $periodNums
        slots = $slots
        rooms = $roomSplit
        teacher = $teacher
        credit = $credit
        eval = $eval
    }
}

$roomsList = $allRoomsMap.Values | Sort-Object { $_.name }

$exportData = [ordered]@{
    meta = @{
        updatedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm")
        totalLessons = $lessons.Count
        totalRooms = $roomsList.Count
    }
    categories = [ordered]@{
        lecture = "一般講義室"
        info = "情報センター"
        lab = "実験室・理科"
        art = "美術・書道・実習"
        music = "音楽棟"
        sports = "体育・スポーツ施設"
        other = "演習室・センター・他"
    }
    slots = @(
        @{ id = 1; name = "1・2限"; time = "09:00 - 10:30" }
        @{ id = 2; name = "3・4限"; time = "10:40 - 12:10" }
        @{ id = 3; name = "5・6限"; time = "13:00 - 14:30" }
        @{ id = 4; name = "7・8限"; time = "14:40 - 16:10" }
        @{ id = 5; name = "9・10限"; time = "16:20 - 17:50" }
    )
    days = @("月", "火", "水", "木", "金")
    semesters = @("前期", "後期")
    rooms = $roomsList
    lessons = $lessons
}

$json = $exportData | ConvertTo-Json -Depth 6 -Compress
[System.IO.File]::WriteAllText('C:\Users\Hyobu\.gemini\antigravity\scratch\classroom-finder\data.json', $json, [System.Text.Encoding]::UTF8)

$jsContent = "window.SYLLABUS_DATA = " + $json + ";"
[System.IO.File]::WriteAllText('C:\Users\Hyobu\.gemini\antigravity\scratch\classroom-finder\data.js', $jsContent, [System.Text.Encoding]::UTF8)

Write-Output ("Export finished! Rooms: " + $roomsList.Count + ", Lessons: " + $lessons.Count)
