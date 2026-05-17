const demoReservations = [
      {
        reservationIdList: [
          { id: '163216', type: 'Reservation' },
          { id: '137061322', type: 'Confirmation' },
        ],
        sourceOfSale: { sourceType: 'PMS', sourceCode: 'DPHSS' },
        roomStay: {
          registrationNumber: { id: '', type: 'Reservation' },
          currentRoomInfo: { roomType: 'MTKS', roomOwnershipType: 'Regular' },
          roomRates: [
            {
              total: { amountBeforeTax: 2500000 },
              rates: {
                rate: [
                  {
                    base: {
                      amountBeforeTax: 2500000,
                      currencyCode: 'IDR',
                      baseAmount: 2500000,
                    },
                    shareDistributionInstruction: 'Full',
                    total: { amountBeforeTax: 2500000 },
                    start: '2025-08-05',
                    end: '2025-08-05',
                  },
                ],
              },
              guestCounts: { adults: 1, children: 0 },
              taxFreeGuestCounts: { adults: 0, children: 0 },
              roomType: 'MTKS',
              ratePlanCode: 'BFR',
              start: '2025-08-05',
              end: '2025-08-05',
              suppressRate: false,
              marketCode: 'DIR',
              marketCodeDescription: 'Discounted Rate',
              sourceCode: 'WEB',
              sourceCodeDescription: 'Brand Website',
              numberOfUnits: 1,
              pseudoRoom: false,
              roomTypeCharged: 'MTKS',
              houseUseOnly: false,
              complimentary: false,
              fixedRate: false,
              discountAllowed: true,
              bogoDiscount: false,
              allowAutoCheckIn: false,
            },
          ],
          guestCounts: { adults: 1, children: 0 },
          arrivalDate: '2025-08-05',
          departureDate: '2025-08-06',
          expectedTimes: {
            reservationExpectedArrivalTime: '2025-08-05',
            reservationExpectedDepartureTime: '2025-08-06',
          },
          guarantee: {
            guaranteeCode: 'COMP',
            shortDescription: 'Company Guaranteed',
          },
          total: { amountBeforeTax: 2500000 },
          totalPoints: { points: 0 },
          roomNumberLocked: false,
          printRate: true,
        },
        reservationGuests: [
          {
            profileInfo: {
              profileIdList: [{ id: '1207676', type: 'Profile' }],
              profile: {
                customer: {
                  personName: [
                    {
                      givenName: 'Blake',
                      surname: 'Shelton',
                      nameTitle: 'Mr',
                      nameType: 'Primary',
                    },
                  ],
                  language: 'E',
                },
                addresses: {
                  addressInfo: [
                    {
                      address: {
                        isValidated: false,
                        country: { displayCountryFlag: false },
                        language: 'E',
                        type: 'HOME',
                        primaryInd: true,
                      },
                      id: '1397370',
                      type: 'Address',
                    },
                  ],
                },
                telephones: {
                  telephoneInfo: [
                    {
                      telephone: {
                        phoneTechType: 'PHONE',
                        phoneUseType: 'MOBILE',
                        phoneNumber: '081770452444',
                        primaryInd: true,
                      },
                      id: '1714327',
                      type: 'Communication',
                    },
                  ],
                },
                emails: {
                  emailInfo: [
                    {
                      email: {
                        emailAddress: 'abeachalways@yahoo.com',
                        type: 'EMAIL',
                        primaryInd: true,
                      },
                      id: '1714329',
                      type: 'Email',
                    },
                  ],
                },
                profileType: 'Guest',
              },
            },
            arrivalTransport: { transportationReqd: false },
            departureTransport: { transportationReqd: false },
            primary: true,
          },
        ],
        reservationPackages: [
          {
            packageHeaderType: {
              primaryDetails: {
                description: 'Breakfast inclusion for Complimentary',
              },
              transactionDetails: {
                allowance: false,
                currency: 'IDR',
                postingType: 'D',
                calculationRule: 'A',
              },
              postingAttributes: {
                addToRate: false,
                printSeparateLine: false,
                postNextDay: false,
                forecastNextDay: false,
              },
            },
            scheduleList: [
              {
                consumptionDate: '2025-08-05',
                unitPrice: 0,
                totalQuantity: 1,
                computedResvPrice: 0,
                unitAllowance: 0,
                reservationDate: '2025-08-05',
                originalUnitPrice: 0,
                originalUnitAllowance: 0,
              },
            ],
            consumptionDetails: {
              defaultQuantity: 1,
              totalQuantity: 1,
              allowanceConsumed: false,
            },
            packageCode: 'BFCOMP',
            internalId: 106490,
            ratePlanCode: 'BFR',
            source: 'RateDetail',
          },
        ],
        cashiering: {
          billingPrivileges: {
            postingRestriction: true,
            postStayCharging: false,
            videoCheckout: false,
          },
          compAccounting: { compPostings: 'N' },
          reverseCheckInAllowed: false,
          reverseAdvanceCheckInAllowed: false,
          transactionsPosted: false,
        },
        extSystemSync: false,
        hotelId: 'DPHSS',
        roomStayReservation: true,
        reservationStatus: 'Reserved',
        computedReservationStatus: 'DueIn',
        walkIn: false,
        printRate: true,
        createDateTime: '2025-08-06 07:44:14.0',
        creatorId: 'JTAN@DPSPH',
        lastModifyDateTime: '2025-08-06 07:44:14.0',
        lastModifierId: 'JTAN@DPSPH',
        createBusinessDate: '2025-08-05',
        preRegistered: false,
        upgradeEligible: false,
        allowAutoCheckin: false,
        hasOpenFolio: false,
        allowMobileCheckout: false,
        allowMobileViewFolio: false,
        allowPreRegistration: false,
        optedForCommunication: false,
        backToBack: false,
        payeeSharer: false,
      },
      {
        reservationIdList: [
          { id: '200001', type: 'Reservation' },
          { id: '200002', type: 'Confirmation' },
        ],
        sourceOfSale: { sourceType: 'OTA', sourceCode: 'BOOKONLINE' },
        roomStay: {
          registrationNumber: { id: '', type: 'Reservation' },
          currentRoomInfo: { roomType: 'DELUXE', roomOwnershipType: 'Regular' },
          roomRates: [
            {
              total: { amountBeforeTax: 4500000 },
              rates: {
                rate: [
                  {
                    base: {
                      amountBeforeTax: 4500000,
                      currencyCode: 'IDR',
                      baseAmount: 4500000,
                    },
                    shareDistributionInstruction: 'Full',
                    total: { amountBeforeTax: 4500000 },
                    start: '2025-09-10',
                    end: '2025-09-12',
                  },
                ],
              },
              guestCounts: { adults: 2, children: 1 },
              taxFreeGuestCounts: { adults: 0, children: 0 },
              roomType: 'DELUXE',
              ratePlanCode: 'BFR',
              start: '2025-09-10',
              end: '2025-09-12',
              suppressRate: false,
              marketCode: 'DIR',
              marketCodeDescription: 'Direct Rate',
              sourceCode: 'WEB',
              sourceCodeDescription: 'Website Booking',
              numberOfUnits: 1,
              pseudoRoom: false,
              roomTypeCharged: 'DELUXE',
              houseUseOnly: false,
              complimentary: false,
              fixedRate: false,
              discountAllowed: true,
              bogoDiscount: false,
              allowAutoCheckIn: false,
            },
          ],
          guestCounts: { adults: 2, children: 1 },
          arrivalDate: '2025-09-10',
          departureDate: '2025-09-12',
          expectedTimes: {
            reservationExpectedArrivalTime: '2025-09-10',
            reservationExpectedDepartureTime: '2025-09-12',
          },
          guarantee: {
            guaranteeCode: 'CC',
            shortDescription: 'Credit Card Guaranteed',
          },
          total: { amountBeforeTax: 4500000 },
          totalPoints: { points: 0 },
          roomNumberLocked: false,
          printRate: true,
        },
        reservationGuests: [
          {
            profileInfo: {
              profileIdList: [{ id: '210001', type: 'Profile' }],
              profile: {
                customer: {
                  personName: [
                    {
                      givenName: 'Taylor',
                      surname: 'Swift',
                      nameTitle: 'Ms',
                      nameType: 'Primary',
                    },
                  ],
                  language: 'E',
                },
                addresses: {
                  addressInfo: [
                    {
                      address: {
                        isValidated: true,
                        country: { displayCountryFlag: true },
                        language: 'E',
                        type: 'HOME',
                        primaryInd: true,
                      },
                      id: '210002',
                      type: 'Address',
                    },
                  ],
                },
                telephones: {
                  telephoneInfo: [
                    {
                      telephone: {
                        phoneTechType: 'PHONE',
                        phoneUseType: 'MOBILE',
                        phoneNumber: '081234567890',
                        primaryInd: true,
                      },
                      id: '210003',
                      type: 'Communication',
                    },
                  ],
                },
                emails: {
                  emailInfo: [
                    {
                      email: {
                        emailAddress: 'taylor.swift@example.com',
                        type: 'EMAIL',
                        primaryInd: true,
                      },
                      id: '210004',
                      type: 'Email',
                    },
                  ],
                },
                profileType: 'Guest',
              },
            },
            arrivalTransport: { transportationReqd: false },
            departureTransport: { transportationReqd: false },
            primary: true,
          },
        ],
        reservationPackages: [
          {
            packageHeaderType: {
              primaryDetails: { description: 'Breakfast inclusion' },
              transactionDetails: {
                allowance: false,
                currency: 'IDR',
                postingType: 'D',
                calculationRule: 'A',
              },
              postingAttributes: {
                addToRate: false,
                printSeparateLine: false,
                postNextDay: false,
                forecastNextDay: false,
              },
            },
            scheduleList: [
              {
                consumptionDate: '2025-09-10',
                unitPrice: 0,
                totalQuantity: 3,
                computedResvPrice: 0,
                unitAllowance: 0,
                reservationDate: '2025-09-10',
                originalUnitPrice: 0,
                originalUnitAllowance: 0,
              },
            ],
            consumptionDetails: {
              defaultQuantity: 3,
              totalQuantity: 3,
              allowanceConsumed: false,
            },
            packageCode: 'BFDELUXE',
            internalId: 210500,
            ratePlanCode: 'BFR',
            source: 'RateDetail',
          },
        ],
        cashiering: {
          billingPrivileges: {
            postingRestriction: true,
            postStayCharging: false,
            videoCheckout: false,
          },
          compAccounting: { compPostings: 'N' },
          reverseCheckInAllowed: false,
          reverseAdvanceCheckInAllowed: false,
          transactionsPosted: false,
        },
        extSystemSync: false,
        hotelId: 'BOOKONLINE',
        roomStayReservation: true,
        reservationStatus: 'Confirmed',
        computedReservationStatus: 'DueIn',
        walkIn: false,
        printRate: true,
        createDateTime: '2025-09-01 08:15:30.0',
        creatorId: 'WEBUSER01',
        lastModifyDateTime: '2025-09-01 08:15:30.0',
        lastModifierId: 'WEBUSER01',
        createBusinessDate: '2025-09-01',
        preRegistered: false,
        upgradeEligible: false,
        allowAutoCheckin: false,
        hasOpenFolio: false,
        allowMobileCheckout: false,
        allowMobileViewFolio: false,
        allowPreRegistration: false,
        optedForCommunication: true,
        backToBack: false,
        payeeSharer: false,
      },
    ];

module.exports = { demoReservations };
