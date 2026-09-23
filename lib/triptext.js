// Pure formatter: trip plan -> plain text for clipboard / Notes app / text message.
// No DOM, no network. Input shape matches what planLoad already produces in index.html.

// The Covenant nav code for a stop, appended to its line so a plan pasted
// into Notes or texted to dispatch carries the codes with it. Labelled the
// same way the station sheet and the result card label it ("Nav code")
// rather than bare, so it reads as a code and not a stray identifier.
//
// Guarded even though every plannable stop has one: index.html maps `nav`
// on from row[20], but this is a pure function tested independently of DATA
// and must not assume the caller set the field. Absent means no tag at all,
// never a dangling separator.
function navTag(s) {
  return s.nav ? `  Nav code ${s.nav}` : '';
}

function formatTripText(trip) {
  const {
    pickupAddr, deliveryAddr, routeLabel, vehicle,
    plan, gap, finalLegMiles, detourMax, appVersion, fuelBookRev,
    postGapPlan, postGapFinalLegMiles, postGapSecondGap,
    arrivalRange, nearestToDelivery
  } = trip;

  const lines = [];
  lines.push('FUELPOST TRIP PLAN');
  lines.push('');
  lines.push(`Pickup:   ${pickupAddr}`);
  lines.push(`Delivery: ${deliveryAddr}`);
  // Only set when the driver actually had alternative routes to choose
  // between — it names which one this text describes, so two pasted plans
  // for the same load can be told apart. Omitted otherwise, which keeps
  // the single-route output byte-identical to before.
  if (routeLabel) lines.push(`Route:    ${routeLabel}`);
  // Set only when the vehicle profile wasn't Standard. These roads were
  // chosen for a specific truck — a placarded or oversize plan has to say so,
  // otherwise two pasted plans for the same lane look inexplicably different.
  if (vehicle) lines.push(`Vehicle:  ${vehicle}`);
  lines.push('');

  if (plan && plan.length) {
    lines.push('FUEL STOPS');
    plan.forEach((s, i) => {
      const leg = s.legMiles != null ? `  (${s.legMiles} mi leg)` : '';
      const tier = s.tier === 'excl' ? '  [Exclusive]' : '';
      lines.push(`${i + 1}. ${s.name} \u2014 mile ${Math.round(s.mile)}${leg}${tier}${navTag(s)}`);
    });
  } else if (!gap) {
    lines.push('No fuel stop needed \u2014 destination is within range.');
    // Only ever set on a no-stop plan (renderPlan omits both otherwise): a
    // shared plan that says nothing but "no stop needed" loses the useful
    // half of the answer \u2014 what range the truck arrives with, and where
    // network fuel sits once it stops moving. Placed inside this branch so
    // a plan with required stops can never grow these lines, even if the
    // fields were somehow set.
    if (arrivalRange != null) {
      lines.push(`You arrive with about ${arrivalRange} mi of range.`);
    }
  }

  if (detourMax && detourMax > 8) {
    lines.push('');
    lines.push(`Note: no network stop within 8 mi of the route, this plan uses stops up to ${detourMax} mi off.`);
  }

  if (finalLegMiles != null && plan && plan.length) {
    lines.push('');
    lines.push(`Final leg to delivery: ${finalLegMiles} mi`);
  }

  // WHERE FUEL SITS ONCE THE TRUCK STOPS MOVING. On EVERY plan since v1.60.0,
  // not just the no-stop one: the panel has shown it on every plan since
  // v1.56.0, and a pasted plan that silently drops it answers a different
  // question than the screen it came from.
  //
  // Carries the exit and the nav code for the same reason the stop lines do —
  // this is a stop a driver may actually drive to after dropping the trailer,
  // and a name with no exit is a stop they have to look up again. Both are
  // guarded: the formatter is tested independently of DATA and must not
  // assume the caller filled them in.
  if (nearestToDelivery) {
    lines.push('');
    lines.push('NEAREST NETWORK FUEL TO DELIVERY');
    const tier = nearestToDelivery.tier === 'excl' ? '  [Exclusive]' : '';
    lines.push(`${nearestToDelivery.name} \u2014 ${nearestToDelivery.miles} mi away${tier}`);
    if (nearestToDelivery.exit) lines.push(nearestToDelivery.exit);
    if (nearestToDelivery.nav) lines.push(`Nav code ${nearestToDelivery.nav}`);
  }

  if (gap) {
    lines.push('');
    lines.push(`WARNING \u2014 network fuel gap: no Covenant stop between mile ${gap.fromMile} and mile ${gap.deadMile}.`);
    lines.push('Out-of-network fuel needs approval \u2014 call Driver Support 423-463-3680.');

    // The remainder past the dry line, when the route has one \u2014 same
    // information the screen shows, so a pasted gap plan doesn't read as if
    // the whole rest of the route were empty. Only ever set alongside a gap.
    if (postGapPlan && postGapPlan.length) {
      lines.push('');
      lines.push('AFTER THE GAP (needs the approved out-of-network fuel above first):');
      postGapPlan.forEach((s, i) => {
        const leg = s.legMiles != null ? `  (${s.legMiles} mi leg)` : '';
        const tier = s.tier === 'excl' ? '  [Exclusive]' : '';
        lines.push(`${plan.length + i + 1}. ${s.name} \u2014 mile ${Math.round(s.mile)}${leg}${tier}${navTag(s)}`);
      });
      if (postGapFinalLegMiles != null) {
        lines.push(`Final leg to delivery: ${postGapFinalLegMiles} mi`);
      } else if (postGapSecondGap) {
        lines.push(`Then a SECOND gap between mile ${postGapSecondGap.fromMile} and mile ${postGapSecondGap.deadMile}.`);
      }
    }
  }

  lines.push('');
  lines.push(`Generated by FuelPost${appVersion ? ' v' + appVersion : ''}${fuelBookRev ? ' \u00b7 ' + fuelBookRev : ''}`);

  return lines.join('\n');
}

module.exports = { formatTripText };
