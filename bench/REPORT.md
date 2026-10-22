# ajv benchmark suite: replacement versus ajv

Measured 2026-10-22T02:02:38.729Z on Node.js 24.18.0.

## Environment

- Node.js: 24.18.0 (V8 13.6.233.17-node.50)
- Replacement: ajv 8.20.0 at commit e71a113578712c4e4eb1174026de923ca0b4c781
- Benchmark suite: json-schema-benchmark at commit e9c884f9edd38438a150fef0e9a2a1173c0fcc50 (https://github.com/ebdrup/json-schema-benchmark)
- Cases: JSON-Schema-Test-Suite tests/draft7 and remotes at commit bcf1dc81ae099ade2a9642c672c06ee1af1bb489 (https://github.com/json-schema/JSON-Schema-Test-Suite)
- Machine: AMD Ryzen 9 5950X 16-Core Processor, 32 cores, x64, linux 7.0.0-38-generic, 94 GiB
- Procedure: Benchmark.js 2.1.4, Suite.run({async: false}), minTime 0s, maxTime 5s, minSamples 5; validate every document of the case per iteration

## Result

- Cases included: 193
- Documents verified: 695
- Verdict mismatches: 0
- Cases excluded (schema failed to compile): 52
- Aggregate: geometric mean of per-case throughput ratios (replacement / ajv) = **2.0179**
- Whole-suite throughput: ajv 14,903,767 documents/sec, replacement 32,527,712 documents/sec, ratio 2.183

## Per case

| Case | Documents | ajv (docs/sec) | Replacement (docs/sec) | Ratio |
|---|--:|--:|--:|--:|
| tests/draft7/additionalItems.json :: additionalItems as schema | 2 | 54,334,470 | 112,442,423 | 2.069 |
| tests/draft7/additionalItems.json :: array of items with no additionalItems | 5 | 190,494,170 | 299,047,625 | 1.570 |
| tests/draft7/additionalItems.json :: additionalItems are allowed by default | 1 | 94,061,823 | 99,336,280 | 1.056 |
| tests/draft7/additionalItems.json :: additionalItems should not look in applicators, invalid case | 1 | 35,743,321 | 74,380,933 | 2.081 |
| tests/draft7/additionalProperties.json :: additionalProperties being false does not allow other properties | 6 | 80,113,097 | 98,545,886 | 1.230 |
| tests/draft7/additionalProperties.json :: non-ASCII pattern with additionalProperties | 2 | 37,468,822 | 44,313,000 | 1.183 |
| tests/draft7/additionalProperties.json :: additionalProperties allows a schema which should validate | 3 | 22,966,227 | 97,158,362 | 4.230 |
| tests/draft7/additionalProperties.json :: additionalProperties can exist by itself | 2 | 17,205,061 | 90,524,827 | 5.262 |
| tests/draft7/additionalProperties.json :: additionalProperties are allowed by default | 1 | 120,571,106 | 124,058,413 | 1.029 |
| tests/draft7/additionalProperties.json :: additionalProperties should not look in applicators | 1 | 9,290,237 | 68,222,194 | 7.343 |
| tests/draft7/allOf.json :: allOf | 4 | 65,028,395 | 150,533,267 | 2.315 |
| tests/draft7/allOf.json :: allOf with base schema | 5 | 36,680,240 | 91,810,798 | 2.503 |
| tests/draft7/allOf.json :: allOf simple types | 2 | 84,182,603 | 160,453,058 | 1.906 |
| tests/draft7/allOf.json :: allOf with boolean schemas, all true | 1 | 134,196,251 | 130,103,228 | 0.969 |
| tests/draft7/allOf.json :: allOf with boolean schemas, some false | 1 | 53,450,313 | 119,679,369 | 2.239 |
| tests/draft7/allOf.json :: allOf with boolean schemas, all false | 1 | 53,243,231 | 117,558,141 | 2.208 |
| tests/draft7/allOf.json :: allOf with one empty schema | 1 | 133,039,613 | 131,905,368 | 0.991 |
| tests/draft7/allOf.json :: allOf with two empty schemas | 1 | 133,982,442 | 130,018,400 | 0.970 |
| tests/draft7/allOf.json :: allOf with the first empty schema | 2 | 101,866,937 | 201,069,531 | 1.974 |
| tests/draft7/allOf.json :: allOf with the last empty schema | 2 | 100,833,059 | 202,056,169 | 2.004 |
| tests/draft7/allOf.json :: nested allOf, to check validation semantics | 2 | 110,785,753 | 232,565,381 | 2.099 |
| tests/draft7/allOf.json :: allOf combined with anyOf, oneOf | 8 | 13,467,083 | 22,125,680 | 1.643 |
| tests/draft7/anyOf.json :: anyOf | 4 | 48,770,000 | 108,880,338 | 2.233 |
| tests/draft7/anyOf.json :: anyOf with base schema | 3 | 33,964,780 | 69,910,214 | 2.058 |
| tests/draft7/anyOf.json :: anyOf with boolean schemas, all true | 1 | 137,549,878 | 134,676,299 | 0.979 |
| tests/draft7/anyOf.json :: anyOf with boolean schemas, some true | 1 | 137,034,379 | 131,073,324 | 0.956 |
| tests/draft7/anyOf.json :: anyOf with boolean schemas, all false | 1 | 20,039,208 | 116,951,634 | 5.836 |
| tests/draft7/anyOf.json :: anyOf complex types | 4 | 42,706,000 | 171,457,968 | 4.015 |
| tests/draft7/anyOf.json :: anyOf with one empty schema | 2 | 259,977,325 | 241,581,028 | 0.929 |
| tests/draft7/anyOf.json :: nested anyOf, to check validation semantics | 2 | 39,808,953 | 220,048,284 | 5.528 |
| tests/draft7/anyOf.json :: nested anyOf, to check validation semantics | 2 | 40,736,233 | 230,177,912 | 5.650 |
| tests/draft7/boolean_schema.json :: boolean schema 'true' | 9 | 838,446,326 | 881,077,695 | 1.051 |
| tests/draft7/boolean_schema.json :: boolean schema 'false' | 9 | 64,921,462 | 478,430,919 | 7.369 |
| tests/draft7/const.json :: const validation | 3 | 91,278,022 | 201,338,379 | 2.206 |
| tests/draft7/const.json :: const with object | 4 | 18,424,312 | 24,480,992 | 1.329 |
| tests/draft7/const.json :: const with array | 3 | 21,149,267 | 32,842,404 | 1.553 |
| tests/draft7/const.json :: const with null | 2 | 101,361,082 | 237,547,693 | 2.344 |
| tests/draft7/const.json :: const with false does not match 0 | 3 | 95,108,869 | 302,803,642 | 3.184 |
| tests/draft7/const.json :: const with true does not match 1 | 3 | 93,589,695 | 312,460,641 | 3.339 |
| tests/draft7/const.json :: const with [false] does not match [0] | 3 | 37,088,025 | 56,499,153 | 1.523 |
| tests/draft7/const.json :: const with [true] does not match [1] | 3 | 36,499,553 | 52,961,166 | 1.451 |
| tests/draft7/const.json :: const with {"a": false} does not match {"a": 0} | 3 | 15,416,466 | 21,264,918 | 1.379 |
| tests/draft7/const.json :: const with {"a": true} does not match {"a": 1} | 3 | 15,115,424 | 21,254,243 | 1.406 |
| tests/draft7/const.json :: const with 0 does not match other zero-like types | 6 | 93,289,242 | 237,106,623 | 2.542 |
| tests/draft7/const.json :: const with 1 does not match true | 3 | 129,731,488 | 198,703,252 | 1.532 |
| tests/draft7/const.json :: const with -2.0 matches integer and float types | 5 | 101,495,603 | 324,093,480 | 3.193 |
| tests/draft7/const.json :: float and integers are equal up to 64-bit representation limits | 4 | 103,729,371 | 267,255,152 | 2.576 |
| tests/draft7/const.json :: nul characters in strings | 2 | 78,150,066 | 123,847,551 | 1.585 |
| tests/draft7/contains.json :: contains keyword validation | 6 | 22,007,832 | 188,332,774 | 8.558 |
| tests/draft7/contains.json :: contains keyword with const keyword | 3 | 15,536,798 | 160,867,373 | 10.354 |
| tests/draft7/contains.json :: contains keyword with boolean schema true | 2 | 81,630,938 | 155,849,163 | 1.909 |
| tests/draft7/contains.json :: contains keyword with boolean schema false | 3 | 52,659,655 | 179,863,889 | 3.416 |
| tests/draft7/contains.json :: items + contains | 4 | 9,620,976 | 13,576,970 | 1.411 |
| tests/draft7/default.json :: invalid type for default | 2 | 112,913,990 | 141,279,409 | 1.251 |
| tests/draft7/default.json :: invalid string value for default | 2 | 79,444,649 | 91,934,091 | 1.157 |
| tests/draft7/definitions.json :: valid definition | 1 | 1,467,396 | 33,846,271 | 23.066 |
| tests/draft7/definitions.json :: invalid definition | 1 | 1,397,019 | 25,923,237 | 18.556 |
| tests/draft7/dependencies.json :: dependencies | 7 | 142,961,594 | 268,112,111 | 1.875 |
| tests/draft7/dependencies.json :: dependencies with empty array | 3 | 317,247,726 | 318,428,280 | 1.004 |
| tests/draft7/dependencies.json :: multiple dependencies | 6 | 60,302,071 | 109,301,545 | 1.813 |
| tests/draft7/dependencies.json :: multiple dependencies subschema | 5 | 69,857,758 | 171,414,554 | 2.454 |
| tests/draft7/dependencies.json :: dependencies with boolean subschemas | 4 | 77,434,611 | 182,891,029 | 2.362 |
| tests/draft7/dependencies.json :: dependencies with escaped characters | 7 | 27,255,002 | 57,544,322 | 2.111 |
| tests/draft7/enum.json :: simple enum validation | 2 | 98,622,879 | 207,728,772 | 2.106 |
| tests/draft7/enum.json :: heterogeneous enum validation | 5 | 16,004,669 | 27,474,727 | 1.717 |
| tests/draft7/enum.json :: heterogeneous enum-with-null validation | 3 | 121,570,353 | 194,950,679 | 1.604 |
| tests/draft7/enum.json :: enums in properties | 6 | 73,666,399 | 180,130,973 | 2.445 |
| tests/draft7/enum.json :: enum with escaped characters | 3 | 135,120,602 | 263,847,843 | 1.953 |
| tests/draft7/enum.json :: enum with false does not match 0 | 3 | 90,003,926 | 295,638,277 | 3.285 |
| tests/draft7/enum.json :: enum with true does not match 1 | 3 | 93,335,963 | 297,314,483 | 3.185 |
| tests/draft7/enum.json :: enum with 0 does not match false | 3 | 130,135,214 | 203,228,719 | 1.562 |
| tests/draft7/enum.json :: enum with 1 does not match true | 3 | 126,648,535 | 194,517,987 | 1.536 |
| tests/draft7/enum.json :: nul characters in strings | 2 | 82,297,448 | 135,564,000 | 1.647 |
| tests/draft7/exclusiveMaximum.json :: exclusiveMaximum validation | 4 | 100,239,654 | 265,654,408 | 2.650 |
| tests/draft7/exclusiveMinimum.json :: exclusiveMinimum validation | 4 | 101,700,497 | 251,049,855 | 2.469 |
| tests/draft7/if-then-else.json :: if and then without else | 3 | 88,429,974 | 200,345,932 | 2.266 |
| tests/draft7/if-then-else.json :: if and else without then | 3 | 66,787,382 | 139,707,921 | 2.092 |
| tests/draft7/if-then-else.json :: validate against correct branch, then vs else | 4 | 49,546,406 | 148,028,041 | 2.988 |
| tests/draft7/if-then-else.json :: if with boolean schema true | 2 | 99,434,608 | 207,815,716 | 2.090 |
| tests/draft7/if-then-else.json :: if with boolean schema false | 2 | 100,982,393 | 202,265,138 | 2.003 |
| tests/draft7/if-then-else.json :: if appears at the end when serialized (keyword processing sequence) | 4 | 55,727,967 | 89,269,056 | 1.602 |
| tests/draft7/infinite-loop-detection.json :: evaluating the same schema location against the same data location twice is not a sign of an infinite loop | 2 | 65,701,587 | 103,594,192 | 1.577 |
| tests/draft7/items.json :: a schema given for items | 4 | 109,547,068 | 195,082,641 | 1.781 |
| tests/draft7/items.json :: an array of schemas for items | 6 | 167,328,617 | 244,931,569 | 1.464 |
| tests/draft7/items.json :: items with boolean schema (true) | 2 | 248,168,975 | 264,735,963 | 1.067 |
| tests/draft7/items.json :: items with boolean schema (false) | 2 | 74,343,469 | 170,169,990 | 2.289 |
| tests/draft7/items.json :: items with boolean schemas | 3 | 125,648,433 | 225,136,420 | 1.792 |
| tests/draft7/items.json :: items and subitems | 6 | 30,841,872 | 63,773,163 | 2.068 |
| tests/draft7/items.json :: nested items | 3 | 15,519,326 | 56,196,129 | 3.621 |
| tests/draft7/maximum.json :: maximum validation | 4 | 153,190,783 | 275,693,994 | 1.800 |
| tests/draft7/maximum.json :: maximum validation with unsigned integer | 4 | 151,275,345 | 265,845,233 | 1.757 |
| tests/draft7/maxItems.json :: maxItems validation | 4 | 167,072,323 | 283,334,580 | 1.696 |
| tests/draft7/maxLength.json :: maxLength validation | 5 | 127,993,229 | 153,997,116 | 1.203 |
| tests/draft7/maxProperties.json :: maxProperties validation | 6 | 111,966,018 | 154,333,442 | 1.378 |
| tests/draft7/maxProperties.json :: maxProperties = 0 means the object is empty | 2 | 59,210,349 | 90,312,717 | 1.525 |
| tests/draft7/minimum.json :: minimum validation | 4 | 150,475,207 | 280,518,369 | 1.864 |
| tests/draft7/minimum.json :: minimum validation with signed integer | 7 | 163,444,477 | 327,995,736 | 2.007 |
| tests/draft7/minItems.json :: minItems validation | 4 | 165,672,425 | 284,080,565 | 1.715 |
| tests/draft7/minLength.json :: minLength validation | 5 | 105,425,601 | 169,428,686 | 1.607 |
| tests/draft7/minProperties.json :: minProperties validation | 6 | 121,713,701 | 173,320,364 | 1.424 |
| tests/draft7/multipleOf.json :: by int | 3 | 103,528,757 | 153,682,319 | 1.484 |
| tests/draft7/multipleOf.json :: by number | 3 | 86,211,724 | 125,887,168 | 1.460 |
| tests/draft7/multipleOf.json :: by small number | 2 | 65,623,129 | 105,979,068 | 1.615 |
| tests/draft7/multipleOf.json :: invalid instance should not raise error when float division = inf | 1 | 12,670,041 | 13,802,205 | 1.089 |
| tests/draft7/not.json :: not | 2 | 68,797,575 | 199,193,084 | 2.895 |
| tests/draft7/not.json :: not multiple types | 3 | 64,367,818 | 252,928,921 | 3.929 |
| tests/draft7/not.json :: not more complex schema | 3 | 72,187,516 | 219,707,245 | 3.044 |
| tests/draft7/not.json :: forbidden property | 2 | 79,609,729 | 163,137,053 | 2.049 |
| tests/draft7/not.json :: not with boolean schema true | 1 | 49,957,737 | 104,456,294 | 2.091 |
| tests/draft7/not.json :: not with boolean schema false | 1 | 118,493,443 | 116,909,599 | 0.987 |
| tests/draft7/oneOf.json :: oneOf | 4 | 27,352,745 | 90,024,431 | 3.291 |
| tests/draft7/oneOf.json :: oneOf with base schema | 3 | 36,412,117 | 58,968,996 | 1.619 |
| tests/draft7/oneOf.json :: oneOf with boolean schemas, all true | 1 | 40,370,225 | 103,287,708 | 2.559 |
| tests/draft7/oneOf.json :: oneOf with boolean schemas, one true | 1 | 23,526,175 | 119,756,060 | 5.090 |
| tests/draft7/oneOf.json :: oneOf with boolean schemas, more than one true | 1 | 40,051,451 | 98,929,929 | 2.470 |
| tests/draft7/oneOf.json :: oneOf with boolean schemas, all false | 1 | 15,620,875 | 97,698,021 | 6.254 |
| tests/draft7/oneOf.json :: oneOf complex types | 4 | 29,701,370 | 104,039,890 | 3.503 |
| tests/draft7/oneOf.json :: oneOf with empty schema | 2 | 51,960,674 | 186,254,457 | 3.585 |
| tests/draft7/oneOf.json :: oneOf with required | 4 | 23,682,019 | 110,527,711 | 4.667 |
| tests/draft7/oneOf.json :: oneOf with missing optional property | 4 | 29,615,718 | 125,774,226 | 4.247 |
| tests/draft7/oneOf.json :: nested oneOf, to check validation semantics | 2 | 38,223,144 | 181,860,028 | 4.758 |
| tests/draft7/optional/bignum.json :: integer | 1 | 22,605,248 | 25,074,689 | 1.109 |
| tests/draft7/optional/bignum.json :: number | 1 | 110,281,367 | 109,477,318 | 0.993 |
| tests/draft7/optional/bignum.json :: integer | 1 | 24,235,998 | 25,800,958 | 1.065 |
| tests/draft7/optional/bignum.json :: number | 1 | 109,915,285 | 115,011,117 | 1.046 |
| tests/draft7/optional/bignum.json :: string | 1 | 55,025,414 | 111,719,462 | 2.030 |
| tests/draft7/optional/bignum.json :: integer comparison | 1 | 108,791,660 | 100,004,311 | 0.919 |
| tests/draft7/optional/bignum.json :: float comparison with high precision | 1 | 47,978,030 | 99,203,015 | 2.068 |
| tests/draft7/optional/bignum.json :: integer comparison | 1 | 109,844,614 | 97,335,265 | 0.886 |
| tests/draft7/optional/bignum.json :: float comparison with high precision on negative numbers | 1 | 48,903,961 | 97,734,146 | 1.998 |
| tests/draft7/optional/content.json :: validation of string-encoded content based on media type | 3 | 358,238,687 | 354,800,379 | 0.990 |
| tests/draft7/optional/content.json :: validation of binary string-encoding | 3 | 360,217,825 | 351,758,138 | 0.977 |
| tests/draft7/optional/content.json :: validation of binary-encoded media type documents | 4 | 465,690,951 | 477,840,629 | 1.026 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 regex $ does not match trailing newline | 2 | 44,876,136 | 52,480,695 | 1.169 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 regex converts \t to horizontal tab | 2 | 46,531,421 | 54,867,175 | 1.179 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 regex escapes control codes with \c and upper letter | 2 | 46,909,776 | 54,543,206 | 1.163 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 regex escapes control codes with \c and lower letter | 2 | 46,190,751 | 54,027,310 | 1.170 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \d matches ascii digits only | 3 | 45,983,115 | 58,674,395 | 1.276 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \D matches everything but ascii digits | 3 | 48,655,151 | 55,829,550 | 1.147 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \w matches ascii letters only | 2 | 47,699,943 | 55,067,344 | 1.154 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \W matches everything but ascii letters | 2 | 47,841,831 | 53,938,674 | 1.127 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \s matches whitespace | 11 | 57,824,713 | 60,894,683 | 1.053 |
| tests/draft7/optional/ecmascript-regex.json :: ECMA 262 \S matches everything but whitespace | 11 | 46,353,790 | 65,582,116 | 1.415 |
| tests/draft7/optional/float-overflow.json :: all integers are multiples of 0.5, if overflow is handled | 1 | 12,495,161 | 13,941,529 | 1.116 |
| tests/draft7/optional/non-bmp-regex.json :: Proper UTF-16 surrogate pair handling: pattern | 7 | 49,214,793 | 61,637,104 | 1.252 |
| tests/draft7/optional/non-bmp-regex.json :: Proper UTF-16 surrogate pair handling: patternProperties | 5 | 11,670,978 | 40,128,212 | 3.438 |
| tests/draft7/pattern.json :: pattern validation | 8 | 137,905,058 | 151,009,727 | 1.095 |
| tests/draft7/pattern.json :: pattern is not anchored | 1 | 42,692,862 | 40,571,612 | 0.950 |
| tests/draft7/patternProperties.json :: patternProperties validates properties matching a regex | 7 | 21,237,444 | 53,381,809 | 2.514 |
| tests/draft7/patternProperties.json :: multiple simultaneous patternProperties are validated | 6 | 9,784,222 | 23,336,553 | 2.385 |
| tests/draft7/patternProperties.json :: regexes are not anchored by default and are case sensitive | 4 | 10,683,107 | 24,869,568 | 2.328 |
| tests/draft7/patternProperties.json :: patternProperties with boolean schemas | 5 | 12,704,176 | 45,863,497 | 3.610 |
| tests/draft7/properties.json :: object properties validation | 6 | 112,927,624 | 256,109,966 | 2.268 |
| tests/draft7/properties.json :: properties with boolean schema | 4 | 90,077,428 | 218,783,388 | 2.429 |
| tests/draft7/properties.json :: properties with escaped characters | 2 | 51,585,567 | 124,848,706 | 2.420 |
| tests/draft7/propertyNames.json :: propertyNames validation | 6 | 68,053,509 | 114,314,336 | 1.680 |
| tests/draft7/propertyNames.json :: propertyNames with boolean schema true | 2 | 256,754,982 | 267,768,242 | 1.043 |
| tests/draft7/propertyNames.json :: propertyNames with boolean schema false | 2 | 42,021,482 | 115,342,521 | 2.745 |
| tests/draft7/ref.json :: root pointer ref | 4 | 33,744,110 | 87,468,022 | 2.592 |
| tests/draft7/ref.json :: relative pointer ref to object | 2 | 78,998,400 | 161,795,974 | 2.048 |
| tests/draft7/ref.json :: relative pointer ref to array | 2 | 83,941,653 | 135,681,600 | 1.616 |
| tests/draft7/ref.json :: escaped pointer ref | 6 | 82,296,751 | 180,586,964 | 2.194 |
| tests/draft7/ref.json :: nested refs | 2 | 102,534,935 | 199,211,939 | 1.943 |
| tests/draft7/ref.json :: ref overrides any sibling keywords | 3 | 72,463,540 | 177,473,507 | 2.449 |
| tests/draft7/ref.json :: remote ref, containing refs itself | 2 | 5,378,866 | 75,719,117 | 14.077 |
| tests/draft7/ref.json :: property named $ref that is not a reference | 2 | 80,359,064 | 165,372,902 | 2.058 |
| tests/draft7/ref.json :: property named $ref, containing an actual $ref | 2 | 80,990,853 | 165,941,444 | 2.049 |
| tests/draft7/ref.json :: $ref to boolean schema true | 1 | 135,891,928 | 120,669,577 | 0.888 |
| tests/draft7/ref.json :: $ref to boolean schema false | 1 | 46,058,867 | 99,042,262 | 2.150 |
| tests/draft7/ref.json :: refs with quote | 2 | 69,160,554 | 134,771,068 | 1.949 |
| tests/draft7/ref.json :: naive replacement of $ref with its destination is not correct | 2 | 19,954,189 | 27,866,384 | 1.397 |
| tests/draft7/refRemote.json :: remote ref | 2 | 86,551,107 | 180,473,376 | 2.085 |
| tests/draft7/required.json :: required validation | 5 | 135,079,389 | 262,819,798 | 1.946 |
| tests/draft7/required.json :: required default validation | 1 | 115,476,426 | 116,907,178 | 1.012 |
| tests/draft7/required.json :: required with empty array | 1 | 112,346,381 | 114,837,254 | 1.022 |
| tests/draft7/required.json :: required with escaped characters | 2 | 53,961,937 | 125,562,137 | 2.327 |
| tests/draft7/type.json :: integer type matches integers | 9 | 68,828,703 | 178,569,568 | 2.594 |
| tests/draft7/type.json :: number type matches numbers | 9 | 86,378,218 | 297,872,592 | 3.448 |
| tests/draft7/type.json :: string type matches strings | 9 | 89,224,126 | 307,093,425 | 3.442 |
| tests/draft7/type.json :: object type matches objects | 7 | 67,557,329 | 284,863,410 | 4.217 |
| tests/draft7/type.json :: array type matches arrays | 7 | 71,080,297 | 282,776,121 | 3.978 |
| tests/draft7/type.json :: boolean type matches booleans | 10 | 77,782,386 | 307,537,510 | 3.954 |
| tests/draft7/type.json :: null type matches only the null object | 10 | 72,813,840 | 330,518,464 | 4.539 |
| tests/draft7/type.json :: multiple types can be specified in an array | 7 | 73,489,041 | 213,305,678 | 2.903 |
| tests/draft7/type.json :: type as array with one item | 2 | 101,523,414 | 198,814,088 | 1.958 |
| tests/draft7/type.json :: type: array or object | 5 | 95,844,338 | 287,849,731 | 3.003 |
| tests/draft7/type.json :: type: array, object or null | 5 | 133,594,468 | 301,419,353 | 2.256 |
| tests/draft7/uniqueItems.json :: uniqueItems validation | 23 | 13,914,901 | 21,707,895 | 1.560 |
| tests/draft7/uniqueItems.json :: uniqueItems with an array of items | 8 | 27,283,555 | 45,622,680 | 1.672 |
| tests/draft7/uniqueItems.json :: uniqueItems with an array of items and additionalItems=false | 5 | 39,470,334 | 81,662,896 | 2.069 |
| tests/draft7/uniqueItems.json :: uniqueItems=false validation | 15 | 1,038,621,915 | 696,622,694 | 0.671 |
| tests/draft7/uniqueItems.json :: uniqueItems=false with an array of items | 8 | 254,758,915 | 270,476,559 | 1.062 |
| tests/draft7/uniqueItems.json :: uniqueItems=false with an array of items and additionalItems=false | 5 | 158,953,516 | 217,812,070 | 1.370 |

## Excluded cases

Schemas that a validator could not compile carry no comparable verdict.

- tests/draft7/additionalItems.json :: items is schema, no additionalItems (ajv: strict mode: "additionalItems" is ignored when "items" is not an array of schemas)
- tests/draft7/additionalItems.json :: additionalItems as false without items (ajv: strict mode: "additionalItems" is ignored when "items" is not an array of schemas)
- tests/draft7/additionalItems.json :: additionalItems should not look in applicators, valid case (ajv: strict mode: "additionalItems" is ignored when "items" is not an array of schemas)
- tests/draft7/format.json :: validation of e-mail addresses (ajv: unknown format "email" ignored in schema at path "#")
- tests/draft7/format.json :: validation of IDN e-mail addresses (ajv: unknown format "idn-email" ignored in schema at path "#")
- tests/draft7/format.json :: validation of regexes (ajv: unknown format "regex" ignored in schema at path "#")
- tests/draft7/format.json :: validation of IP addresses (ajv: unknown format "ipv4" ignored in schema at path "#")
- tests/draft7/format.json :: validation of IPv6 addresses (ajv: unknown format "ipv6" ignored in schema at path "#")
- tests/draft7/format.json :: validation of IDN hostnames (ajv: unknown format "idn-hostname" ignored in schema at path "#")
- tests/draft7/format.json :: validation of hostnames (ajv: unknown format "hostname" ignored in schema at path "#")
- tests/draft7/format.json :: validation of date strings (ajv: unknown format "date" ignored in schema at path "#")
- tests/draft7/format.json :: validation of date-time strings (ajv: unknown format "date-time" ignored in schema at path "#")
- tests/draft7/format.json :: validation of time strings (ajv: unknown format "time" ignored in schema at path "#")
- tests/draft7/format.json :: validation of JSON pointers (ajv: unknown format "json-pointer" ignored in schema at path "#")
- tests/draft7/format.json :: validation of relative JSON pointers (ajv: unknown format "relative-json-pointer" ignored in schema at path "#")
- tests/draft7/format.json :: validation of IRIs (ajv: unknown format "iri" ignored in schema at path "#")
- tests/draft7/format.json :: validation of IRI references (ajv: unknown format "iri-reference" ignored in schema at path "#")
- tests/draft7/format.json :: validation of URIs (ajv: unknown format "uri" ignored in schema at path "#")
- tests/draft7/format.json :: validation of URI references (ajv: unknown format "uri-reference" ignored in schema at path "#")
- tests/draft7/format.json :: validation of URI templates (ajv: unknown format "uri-template" ignored in schema at path "#")
- tests/draft7/if-then-else.json :: ignore if without then or else (ajv: strict mode: "if" without "then" and "else" is ignored)
- tests/draft7/if-then-else.json :: ignore then without if (ajv: strict mode: "then" without "if" is ignored)
- tests/draft7/if-then-else.json :: ignore else without if (ajv: strict mode: "else" without "if" is ignored)
- tests/draft7/if-then-else.json :: non-interference across combined schemas (ajv: strict mode: "if" without "then" and "else" is ignored)
- tests/draft7/optional/format/date-time.json :: validation of date-time strings (ajv: unknown format "date-time" ignored in schema at path "#")
- tests/draft7/optional/format/date.json :: validation of date strings (ajv: unknown format "date" ignored in schema at path "#")
- tests/draft7/optional/format/email.json :: validation of e-mail addresses (ajv: unknown format "email" ignored in schema at path "#")
- tests/draft7/optional/format/hostname.json :: validation of host names (ajv: unknown format "hostname" ignored in schema at path "#")
- tests/draft7/optional/format/idn-email.json :: validation of an internationalized e-mail addresses (ajv: unknown format "idn-email" ignored in schema at path "#")
- tests/draft7/optional/format/idn-hostname.json :: validation of internationalized host names (ajv: unknown format "idn-hostname" ignored in schema at path "#")
- tests/draft7/optional/format/ipv4.json :: validation of IP addresses (ajv: unknown format "ipv4" ignored in schema at path "#")
- tests/draft7/optional/format/ipv6.json :: validation of IPv6 addresses (ajv: unknown format "ipv6" ignored in schema at path "#")
- tests/draft7/optional/format/iri-reference.json :: validation of IRI References (ajv: unknown format "iri-reference" ignored in schema at path "#")
- tests/draft7/optional/format/iri.json :: validation of IRIs (ajv: unknown format "iri" ignored in schema at path "#")
- tests/draft7/optional/format/json-pointer.json :: validation of JSON-pointers (JSON String Representation) (ajv: unknown format "json-pointer" ignored in schema at path "#")
- tests/draft7/optional/format/regex.json :: validation of regular expressions (ajv: unknown format "regex" ignored in schema at path "#")
- tests/draft7/optional/format/relative-json-pointer.json :: validation of Relative JSON Pointers (RJP) (ajv: unknown format "relative-json-pointer" ignored in schema at path "#")
- tests/draft7/optional/format/time.json :: validation of time strings (ajv: unknown format "time" ignored in schema at path "#")
- tests/draft7/optional/format/uri-reference.json :: validation of URI References (ajv: unknown format "uri-reference" ignored in schema at path "#")
- tests/draft7/optional/format/uri-template.json :: format: uri-template (ajv: unknown format "uri-template" ignored in schema at path "#")
- tests/draft7/optional/format/uri.json :: validation of URIs (ajv: unknown format "uri" ignored in schema at path "#")
- tests/draft7/properties.json :: properties, patternProperties, additionalProperties interaction (ajv: strict mode: property foo matches pattern f.o (use allowMatchingProperties))
- tests/draft7/ref.json :: Recursive references between schemas (ajv: can't resolve reference node from id #)
- tests/draft7/ref.json :: Location-independent identifier (ajv: can't resolve reference #foo from id #)
- tests/draft7/ref.json :: Location-independent identifier with absolute URI (ajv: can't resolve reference http://localhost:1234/bar#foo from id #)
- tests/draft7/ref.json :: Location-independent identifier with base URI change in subschema (ajv: can't resolve reference http://localhost:1234/nested.json#foo from id #)
- tests/draft7/refRemote.json :: fragment within remote ref (ajv: strict mode: unknown keyword: "integer")
- tests/draft7/refRemote.json :: ref within remote ref (ajv: strict mode: unknown keyword: "integer")
- tests/draft7/refRemote.json :: base URI change (ajv: can't resolve reference folderInteger.json from id #)
- tests/draft7/refRemote.json :: base URI change - change folder (ajv: can't resolve reference folderInteger.json from id #)
- tests/draft7/refRemote.json :: base URI change - change folder in subschema (ajv: can't resolve reference folderInteger.json from id #)
- tests/draft7/refRemote.json :: root ref in remote ref (ajv: can't resolve reference name.json#/definitions/orNull from id #)
