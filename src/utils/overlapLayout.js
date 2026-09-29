// Google Calendar jaisa overlap layout.
// Input : ek din ke events [{ id, start, end }]  (start/end numbers, jaise ms ya minutes)
// Output: Map( id -> { column, columns, span } )
//   left  = column / columns * 100 %
//   width = span   / columns * 100 %
//
// Steps:
// 1. Sort: start ascending, tie mein lamba event pehle
// 2. Cluster: jo events aapas mein (seedhe ya beech wale ke through) overlap karte hain
//    unka ek group. Group ke andar hi columns baantne hain.
// 3. Column assign: har event ko pehla aisa column do jahan wo free ho
// 4. Expand: event ko daayein taraf tab tak failao jab tak koi aur event na rok le

export function layoutDayEvents(events, minSpan = 0) {
  const items = events
    .map((e) => ({
      id: e.id,
      start: e.start,
      end: Math.max(e.end, e.start + minSpan), // 0-length event bhi dikhe
    }))
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const result = new Map();
  let cluster = [];
  let clusterEnd = -Infinity;

  for (const item of items) {
    // Naya event cluster ke end ke baad shuru ho raha hai -> purana cluster band
    // (start === end matlab sirf touch kar rahe hain, overlap nahi)
    if (cluster.length > 0 && item.start >= clusterEnd) {
      layoutCluster(cluster, result);
      cluster = [];
      clusterEnd = -Infinity;
    }
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  if (cluster.length > 0) layoutCluster(cluster, result);

  return result;
}

function overlaps(a, b) {
  return a.start < b.end && b.start < a.end;
}

function layoutCluster(cluster, result) {
  // columns[i] = us column mein rakhe events (start order mein)
  const columns = [];

  // Step 3: greedy column assignment
  for (const item of cluster) {
    let placed = false;
    for (let c = 0; c < columns.length; c++) {
      const last = columns[c][columns[c].length - 1];
      if (last.end <= item.start) {
        columns[c].push(item);
        item.column = c;
        placed = true;
        break;
      }
    }
    if (!placed) {
      item.column = columns.length;
      columns.push([item]);
    }
  }

  const total = columns.length;

  // Step 4: daayein taraf expand
  for (const item of cluster) {
    let span = 1;
    for (let c = item.column + 1; c < total; c++) {
      const blocked = columns[c].some((other) => overlaps(item, other));
      if (blocked) break;
      span++;
    }
    result.set(item.id, { column: item.column, columns: total, span });
  }
}