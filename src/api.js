// api.js - Reservation API module
import axios from 'axios';
import authService from './auth.js'; // Import the AuthService

const API_BASE_URL = 'https://mtcs1ua.hospitality-api.ap-singapore-1.ocs.oc-test.com/';

class ReservationApi {
  async findReservations(params) {
    const authHeader = await authService.getAuthorization();
    
    try {
      const response = await axios.get(`${API_BASE_URL}/reservations`, {
        params: this.buildSearchParams(params),
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      console.error('Reservation search failed:', error);
      throw new Error(`API request failed: ${error.response?.data?.message || error.message}`);
    }
  }

  buildSearchParams({
    reservationIds,
    confirmationIds,
    externalReferenceIds,
    customReference,
    lastName,
    room,
    arrivalStartDate,
    departureStartDate,
    arrivalEndDate,
    departureEndDate,
    disposition
  }) {
    const params = {
      hotelId: authService.config.hotelId,
      appKey: authService.config.appKey,
      limit: 100, // Adjust as needed
      offset: 0
    };

    // Add parameters only if they exist
    if (reservationIds) params.reservationIds = reservationIds.join(',');
    if (confirmationIds) params.confirmationIds = confirmationIds.join(',');
    if (externalReferenceIds) params.externalReferenceIds = externalReferenceIds.join(',');
    if (customReference) params.customReference = customReference;
    if (lastName) params.lastName = lastName;
    if (room) params.room = room;
    
    // Date handling
    if (arrivalStartDate) params.arrivalStartDate = arrivalStartDate.toISOString().split('T')[0];
    if (departureStartDate) params.departureStartDate = departureStartDate.toISOString().split('T')[0];
    if (arrivalEndDate) params.arrivalEndDate = arrivalEndDate.toISOString().split('T')[0];
    if (departureEndDate) params.departureEndDate = departureEndDate.toISOString().split('T')[0];
    
    // Disposition handling
    if (disposition) params.disposition = disposition.join(',');

    return params;
  }
}

// Create singleton instance
const reservationApi = new ReservationApi();

export default reservationApi;