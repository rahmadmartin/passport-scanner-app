function createReservationRenderer({ documentRef, onSelect }) {
  function createReservationElementFromApi(reservation, index) {
    // console.log('Creating reservation element for:', reservation);
    const reservationIds = reservation.reservationIdList || [];
  
    const reservationId =
      reservationIds.find((id) => id.type === 'Reservation')?.id || `RES${index}`;
    const confirmationId =
      reservationIds.find((id) => id.type === 'Confirmation')?.id || '-';
  
    const arrivalDate = reservation.roomStay?.arrivalDate || '-';
    const departureDate = reservation.roomStay?.departureDate || '-';
  
    const reservationDiv = documentRef.createElement('div');
    reservationDiv.className = 'reservation-item';
    reservationDiv.dataset.index = index;
  
    // Enhanced styling
    reservationDiv.style.cssText = `
      background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 16px;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
      position: relative;
      overflow: hidden;
    `;
  
    // Add hover and selection states
    const addHoverEffects = () => {
      reservationDiv.onmouseenter = () => {
        if (!reservationDiv.classList.contains('selected')) {
          reservationDiv.style.transform = 'translateY(-2px)';
          reservationDiv.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.12)';
          reservationDiv.style.borderColor = '#3b82f6';
        }
      };
  
      reservationDiv.onmouseleave = () => {
        if (!reservationDiv.classList.contains('selected')) {
          reservationDiv.style.transform = 'translateY(0)';
          reservationDiv.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.04)';
          reservationDiv.style.borderColor = '#e2e8f0';
        }
      };
    };
  
    reservationDiv.onclick = () => {
      // Remove selection from other items
      documentRef.querySelectorAll('.reservation-item').forEach((item) => {
        item.classList.remove('selected');
        item.style.background =
          'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)';
        item.style.borderColor = '#e2e8f0';
        item.style.transform = 'translateY(0)';
        item.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.04)';
      });
  
      // Add selection to clicked item
      reservationDiv.classList.add('selected');
      reservationDiv.style.background =
        'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)';
      reservationDiv.style.borderColor = '#3b82f6';
      reservationDiv.style.transform = 'translateY(-1px)';
      reservationDiv.style.boxShadow = '0 8px 25px rgba(59, 130, 246, 0.15)';
  
      onSelect(reservationDiv, reservation);
    };
  
    // Status color mapping
    const getStatusColor = (status) => {
      const statusLower = (status || '').toLowerCase();
      switch (statusLower) {
        case 'confirmed':
          return { bg: '#dcfce7', text: '#166534', border: '#bbf7d0' };
        case 'checked-in':
          return { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' };
        case 'checked-out':
          return { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' };
        case 'cancelled':
          return { bg: '#fee2e2', text: '#dc2626', border: '#fecaca' };
        case 'pending':
          return { bg: '#fef3c7', text: '#d97706', border: '#fde68a' };
        default:
          return { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' };
      }
    };
  
    const statusColors = getStatusColor(reservation.reservationStatus);
  
    // Format dates
    const formatDate = (dateString) => {
      if (!dateString || dateString === '-') return '-';
      try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
      } catch {
        return dateString;
      }
    };
  
    // Calculate stay duration
    const calculateStayDuration = (arrival, departure) => {
      if (!arrival || !departure || arrival === '-' || departure === '-')
        return '';
      try {
        const arrivalDate = new Date(arrival);
        const departureDate = new Date(departure);
        const diffTime = Math.abs(departureDate - arrivalDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays > 0 ? `${diffDays} night${diffDays > 1 ? 's' : ''}` : '';
      } catch {
        return '';
      }
    };
  
    const stayDuration = calculateStayDuration(arrivalDate, departureDate);
  
    reservationDiv.innerHTML = `
      <!-- Header with confirmation number -->
      <div style="
        display: flex; 
        justify-content: space-between; 
        align-items: center; 
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid #e2e8f0;
      ">
        <div style="display: flex; align-items: center; gap: 8px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="color: #3b82f6;">
            <path d="M19 3H5C3.89 3 3 3.89 3 5V19C3 20.11 3.89 21 5 21H19C20.11 21 21 20.11 21 19V5C21 3.89 20.11 3 19 3ZM19 19H5V5H19V19Z" fill="currentColor"/>
            <path d="M7 7H17V9H7V7ZM7 11H17V13H7V11ZM7 15H13V17H7V15Z" fill="currentColor"/>
          </svg>
          <span style="
            font-weight: 600; 
            font-size: 16px; 
            color: #1f2937;
          ">${confirmationId}</span>
        </div>
        <div style="
          background: ${statusColors.bg}; 
          color: ${statusColors.text}; 
          border: 1px solid ${statusColors.border};
          padding: 4px 12px; 
          border-radius: 20px; 
          font-size: 12px; 
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        ">
          ${reservation.reservationStatus || 'Unknown'}
        </div>
      </div>
  
      <!-- Guest Information -->
      <div style="
        display: flex; 
        align-items: center; 
        gap: 10px; 
        margin-bottom: 16px;
      ">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="color: #6b7280; flex-shrink: 0;">
          <path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z" fill="currentColor"/>
        </svg>
        <div>
          <span style="
            font-weight: 600; 
            color: #374151; 
            font-size: 15px;
          ">
            ${
              reservation.reservationGuests && reservation.reservationGuests.length > 0
                ? `${reservation.reservationGuests[0].profileInfo.profile.customer.personName[0].givenName || ''} ${
                    reservation.reservationGuests[0].profileInfo.profile.customer.personName[0].surname || ''
                  }`.trim()
                : 'Guest Name Not Available'
            }
          </span>
        </div>
      </div>
  
      <!-- Room and Dates Grid -->
      <div style="
        display: grid; 
        grid-template-columns: 1fr 1fr; 
        gap: 16px; 
        margin-bottom: 16px;
      ">
        <!-- Room Info -->
        <div style="
          background: #f8fafc; 
          padding: 12px; 
          border-radius: 8px; 
          border-left: 3px solid #3b82f6;
        ">
          <div style="
            display: flex; 
            align-items: center; 
            gap: 8px; 
            margin-bottom: 4px;
          ">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="color: #6b7280;">
              <path d="M7 14C8.66 14 10 12.66 10 11C10 9.34 8.66 8 7 8C5.34 8 4 9.34 4 11C4 12.66 5.34 14 7 14ZM21 9V7L19 5V4C19 2.89 18.11 2 17 2H15C13.89 2 13 2.89 13 4V5L11 7V9H21ZM7 16C4.67 16 0 17.17 0 19.5V20C0 20.55 0.45 21 1 21H13C13.55 21 14 20.55 14 20V19.5C14 17.17 9.33 16 7 16Z" fill="currentColor"/>
            </svg>
            <span style="
              font-size: 12px; 
              color: #6b7280; 
              font-weight: 500;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            ">Room</span>
          </div>
          <span style="
            font-weight: 600; 
            color: #374151; 
            font-size: 14px;
          ">${reservation.roomStay?.roomId || 'Not Assigned'}</span>
        </div>
  
        <!-- Stay Duration -->
        <div style="
          background: #f8fafc; 
          padding: 12px; 
          border-radius: 8px; 
          border-left: 3px solid #10b981;
        ">
          <div style="
            display: flex; 
            align-items: center; 
            gap: 8px; 
            margin-bottom: 4px;
          ">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="color: #6b7280;">
              <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V11H13V17ZM13 9H11V7H13V9Z" fill="currentColor"/>
            </svg>
            <span style="
              font-size: 12px; 
              color: #6b7280; 
              font-weight: 500;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            ">Duration</span>
          </div>
          <span style="
            font-weight: 600; 
            color: #374151; 
            font-size: 14px;
          ">${stayDuration || 'TBD'}</span>
        </div>
      </div>
  
      <!-- Dates Section -->
      <div style="
        display: flex; 
        justify-content: space-between; 
        align-items: center;
        background: linear-gradient(90deg, #f0f9ff 0%, #e0f2fe 100%);
        padding: 12px;
        border-radius: 8px;
        border: 1px solid #bae6fd;
      ">
        <div style="text-align: center; flex: 1;">
          <div style="
            font-size: 11px; 
            color: #0369a1; 
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
          ">Check-in</div>
          <div style="
            font-weight: 600; 
            color: #0c4a6e; 
            font-size: 14px;
          ">${formatDate(arrivalDate)}</div>
        </div>
        
        <div style="
          width: 24px; 
          height: 2px; 
          background: linear-gradient(90deg, #0ea5e9, #0284c7); 
          border-radius: 1px;
          position: relative;
        ">
          <div style="
            position: absolute;
            right: -4px;
            top: -3px;
            width: 0;
            height: 0;
            border-left: 4px solid #0284c7;
            border-top: 4px solid transparent;
            border-bottom: 4px solid transparent;
          "></div>
        </div>
        
        <div style="text-align: center; flex: 1;">
          <div style="
            font-size: 11px; 
            color: #0369a1; 
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
          ">Check-out</div>
          <div style="
            font-weight: 600; 
            color: #0c4a6e; 
            font-size: 14px;
          ">${formatDate(departureDate)}</div>
        </div>
      </div>
  
      <!-- Selection Indicator -->
      <div class="selection-indicator" style="
        position: absolute;
        top: 0;
        left: 0;
        width: 4px;
        height: 100%;
        background: #3b82f6;
        border-radius: 0 4px 4px 0;
        opacity: 0;
        transition: opacity 0.3s ease;
      "></div>
    `;
  
    addHoverEffects();
  
    return reservationDiv;
  }

  return { createReservationElementFromApi };
}

module.exports = { createReservationRenderer };
