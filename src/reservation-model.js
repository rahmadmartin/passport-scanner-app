class Reservation {
  constructor(data) {
    this.reservationIdList = data.reservationIdList || [];
    this.roomStay = data.roomStay || {};
    this.reservationGuest = data.reservationGuest || {};
    this.sharedGuests = data.sharedGuests || [];
    this.attachedProfiles = data.attachedProfiles || [];
    this.reservationPaymentMethod = data.reservationPaymentMethod || {};
    this.reservationIndicators = data.reservationIndicators || [];
    this.sourceOfSale = data.sourceOfSale || {};
    this.waitlist = data.waitlist || {};
    this.advanceCheckIn = data.advanceCheckIn || {};
    this.hotelId = data.hotelId || '';
    this.hotelName = data.hotelName || '';
    this.roomStayReservation = data.roomStayReservation || false;
    this.createDateTime = data.createDateTime || '';
    this.lastModifyDateTime = data.lastModifyDateTime || '';
    this.reservationStatus = data.reservationStatus || '';
    this.computedReservationStatus = data.computedReservationStatus || '';
    this.walkInIndicator = data.walkInIndicator || false;
    this.commissionPayoutTo = data.commissionPayoutTo || '';
    this.paymentMethod = data.paymentMethod || '';
    this.preRegistered = data.preRegistered || false;
    this.openFolio = data.openFolio || false;
    this.allowMobileCheckout = data.allowMobileCheckout || false;
    this.optedForCommunication = data.optedForCommunication || false;
  }

  toShareReservationData() {
    return {
      reservations: {
        reservation: [
          {
            sourceOfSale: this.sourceOfSale,
            roomStay: {
              roomRates: [
                {
                  total: {
                    amountBeforeTax: this.roomStay.rateAmount?.amount || 0,
                    currencyCode: 'IDR',
                  },
                  rates: {
                    rate: [
                      {
                        base: {
                          amountBeforeTax:
                            this.roomStay.rateAmount?.amount || 0,
                          currencyCode: 'IDR',
                        },
                        shareDistributionInstruction: 'Full',
                        total: {
                          amountBeforeTax:
                            this.roomStay.rateAmount?.amount || 0,
                        },
                        start: this.roomStay.originalTimeSpan?.startDate,
                        end: this.roomStay.originalTimeSpan?.endDate,
                      },
                    ],
                  },
                  guestCounts: {
                    adults: this.roomStay.adultCount || 1,
                    children: this.roomStay.childCount || 0,
                  },
                  roomType: this.roomStay.roomType || 'Unknown',
                  numberOfUnits: 1,
                },
              ],
              arrivalDate: this.roomStay.originalTimeSpan?.startDate,
              departureDate: this.roomStay.originalTimeSpan?.endDate,
              guarantee: {
                guaranteeCode: '6PM',
                shortDescription: '6PM Hold',
              },
              roomNumberLocked: false,
            },
            reservationGuests: this.reservationGuest,
            reservationPaymentMethods: [
              {
                paymentMethod:
                  this.reservationPaymentMethod.paymentMethod || 'CSH',
                folioView: '1',
              },
            ],
            comments: [],
            hotelId: this.hotelId,
            reservationStatus: this.reservationStatus,
            computedReservationStatus: this.computedReservationStatus,
            walkIn: false,
            preRegistered: false,
            upgradeEligible: false,
            allowAutoCheckin: false,
            hasOpenFolio: false,
            allowMobileCheckout: false,
            allowMobileViewFolio: false,
            allowPreRegistration: false,
            optedForCommunication: false,
          },
        ],
      },
    };
  }
}
