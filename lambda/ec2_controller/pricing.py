"""Dynamic EC2 on-demand pricing via AWS Price List API.

Provides:
  - get_hourly_price(instance_type, region) → float (USD/hr, Linux on-demand)

Caching:
  - Module-level in-memory cache per region, TTL = 24 hours.
  - On cold Lambda start the cache is empty; first call fetches from Price List API
    (us-east-1 only endpoint) and populates the cache.
  - If the Price List API is unreachable, falls back to a built-in static table
    (ap-south-1 rates — used only as last resort; covers common instance types).
"""

import json
import logging
import time

import boto3

logger = logging.getLogger()

# ─── In-memory cache ────────────────────────────────────────────────────────
_cache = {}          # {region: {'prices': {inst_type: float}, 'ts': float}}
CACHE_TTL = 86400    # 24 hours

# ─── Region code → Price List API "location" name ───────────────────────────
REGION_TO_LOCATION = {
    'ap-south-1':     'Asia Pacific (Mumbai)',
    'ap-south-2':     'Asia Pacific (Hyderabad)',
    'ap-southeast-1': 'Asia Pacific (Singapore)',
    'ap-southeast-2': 'Asia Pacific (Sydney)',
    'ap-southeast-3': 'Asia Pacific (Jakarta)',
    'ap-northeast-1': 'Asia Pacific (Tokyo)',
    'ap-northeast-2': 'Asia Pacific (Seoul)',
    'ap-northeast-3': 'Asia Pacific (Osaka)',
    'ap-east-1':      'Asia Pacific (Hong Kong)',
    'us-east-1':      'US East (N. Virginia)',
    'us-east-2':      'US East (Ohio)',
    'us-west-1':      'US West (N. California)',
    'us-west-2':      'US West (Oregon)',
    'eu-west-1':      'Europe (Ireland)',
    'eu-west-2':      'Europe (London)',
    'eu-west-3':      'Europe (Paris)',
    'eu-central-1':   'Europe (Frankfurt)',
    'eu-north-1':     'Europe (Stockholm)',
    'eu-south-1':     'Europe (Milan)',
    'ca-central-1':   'Canada (Central)',
    'sa-east-1':      'South America (Sao Paulo)',
    'me-south-1':     'Middle East (Bahrain)',
    'af-south-1':     'Africa (Cape Town)',
}

# ─── Fallback static prices (Linux on-demand, ap-south-1) ───────────────────
# Used only when the Price List API call fails (network error, IAM, etc.).
_FALLBACK_PRICES = {
    # T1
    't1.micro': 0.0200,
    # T2
    't2.nano': 0.0058, 't2.micro': 0.0116, 't2.small': 0.0230, 't2.medium': 0.0464,
    't2.large': 0.0928, 't2.xlarge': 0.1856, 't2.2xlarge': 0.3712,
    # T3
    't3.nano': 0.0052, 't3.micro': 0.0104, 't3.small': 0.0208, 't3.medium': 0.0416,
    't3.large': 0.0832, 't3.xlarge': 0.1664, 't3.2xlarge': 0.3328,
    # T3a
    't3a.nano': 0.0047, 't3a.micro': 0.0094, 't3a.small': 0.0188, 't3a.medium': 0.0376,
    't3a.large': 0.0752, 't3a.xlarge': 0.1504, 't3a.2xlarge': 0.3008,
    # T4g (Graviton)
    't4g.nano': 0.0042, 't4g.micro': 0.0084, 't4g.small': 0.0168, 't4g.medium': 0.0336,
    't4g.large': 0.0672, 't4g.xlarge': 0.1344, 't4g.2xlarge': 0.2688,
    # M4
    'm4.large': 0.100, 'm4.xlarge': 0.200, 'm4.2xlarge': 0.400, 'm4.4xlarge': 0.800,
    'm4.10xlarge': 2.000, 'm4.16xlarge': 3.200,
    # M5
    'm5.large': 0.096, 'm5.xlarge': 0.192, 'm5.2xlarge': 0.384, 'm5.4xlarge': 0.768,
    'm5.8xlarge': 1.536, 'm5.12xlarge': 2.304, 'm5.16xlarge': 3.072, 'm5.24xlarge': 4.608,
    # M5a
    'm5a.large': 0.086, 'm5a.xlarge': 0.172, 'm5a.2xlarge': 0.344, 'm5a.4xlarge': 0.688,
    'm5a.8xlarge': 1.376, 'm5a.12xlarge': 2.064, 'm5a.16xlarge': 2.752, 'm5a.24xlarge': 4.128,
    # M6i
    'm6i.large': 0.0960, 'm6i.xlarge': 0.1920, 'm6i.2xlarge': 0.3840, 'm6i.4xlarge': 0.7680,
    'm6i.8xlarge': 1.5360, 'm6i.12xlarge': 2.3040, 'm6i.16xlarge': 3.0720,
    # M6a
    'm6a.large': 0.0864, 'm6a.xlarge': 0.1728, 'm6a.2xlarge': 0.3456, 'm6a.4xlarge': 0.6912,
    # M7i
    'm7i.large': 0.1008, 'm7i.xlarge': 0.2016, 'm7i.2xlarge': 0.4032, 'm7i.4xlarge': 0.8064,
    # C4
    'c4.large': 0.100, 'c4.xlarge': 0.199, 'c4.2xlarge': 0.398, 'c4.4xlarge': 0.796,
    'c4.8xlarge': 1.591,
    # C5
    'c5.large': 0.085, 'c5.xlarge': 0.170, 'c5.2xlarge': 0.340, 'c5.4xlarge': 0.680,
    'c5.9xlarge': 1.530, 'c5.12xlarge': 2.040, 'c5.18xlarge': 3.060, 'c5.24xlarge': 4.080,
    # C5a
    'c5a.large': 0.077, 'c5a.xlarge': 0.154, 'c5a.2xlarge': 0.308, 'c5a.4xlarge': 0.616,
    'c5a.8xlarge': 1.232, 'c5a.12xlarge': 1.848, 'c5a.16xlarge': 2.464, 'c5a.24xlarge': 3.696,
    # C5n
    'c5n.large': 0.108, 'c5n.xlarge': 0.216, 'c5n.2xlarge': 0.432, 'c5n.4xlarge': 0.864,
    # C6i
    'c6i.large': 0.085, 'c6i.xlarge': 0.170, 'c6i.2xlarge': 0.340, 'c6i.4xlarge': 0.680,
    'c6i.8xlarge': 1.360, 'c6i.12xlarge': 2.040, 'c6i.16xlarge': 2.720,
    # C6a
    'c6a.large': 0.0765, 'c6a.xlarge': 0.1530, 'c6a.2xlarge': 0.3060, 'c6a.4xlarge': 0.6120,
    # C7i
    'c7i.large': 0.08925, 'c7i.xlarge': 0.1785, 'c7i.2xlarge': 0.3570, 'c7i.4xlarge': 0.7140,
    # R4
    'r4.large': 0.133, 'r4.xlarge': 0.266, 'r4.2xlarge': 0.532, 'r4.4xlarge': 1.064,
    # R5
    'r5.large': 0.126, 'r5.xlarge': 0.252, 'r5.2xlarge': 0.504, 'r5.4xlarge': 1.008,
    'r5.8xlarge': 2.016, 'r5.12xlarge': 3.024, 'r5.16xlarge': 4.032,
    # R5a
    'r5a.large': 0.1134, 'r5a.xlarge': 0.2268, 'r5a.2xlarge': 0.4536, 'r5a.4xlarge': 0.9072,
    # R6i
    'r6i.large': 0.126, 'r6i.xlarge': 0.252, 'r6i.2xlarge': 0.504, 'r6i.4xlarge': 1.008,
    # R7i
    'r7i.large': 0.1323, 'r7i.xlarge': 0.2646, 'r7i.2xlarge': 0.5292,
    # X1e
    'x1e.xlarge': 0.834, 'x1e.2xlarge': 1.668, 'x1e.4xlarge': 3.336,
    # P2 / P3
    'p2.xlarge': 0.972, 'p2.8xlarge': 7.776, 'p2.16xlarge': 15.552,
    'p3.2xlarge': 3.060, 'p3.8xlarge': 12.240, 'p3.16xlarge': 24.480,
    # G4dn / G5
    'g4dn.xlarge': 0.526, 'g4dn.2xlarge': 0.752, 'g4dn.4xlarge': 1.204,
    'g4dn.8xlarge': 2.264, 'g4dn.12xlarge': 3.912, 'g4dn.16xlarge': 4.528,
    'g5.xlarge': 1.006, 'g5.2xlarge': 1.212, 'g5.4xlarge': 1.624, 'g5.8xlarge': 2.448,
    # Inf1
    'inf1.xlarge': 0.228, 'inf1.2xlarge': 0.362, 'inf1.6xlarge': 1.084,
}

# ─── Fallback static EBS prices (USD/GB-Month, ap-south-1) ────────────────
_FALLBACK_EBS_PRICES = {
    'gp3': {
        'ap-south-1': 0.0832, 'us-east-1': 0.08, 'us-east-2': 0.08, 'us-west-2': 0.08,
        'eu-west-1': 0.088, 'ap-southeast-1': 0.096,
    },
    'gp2': {
        'ap-south-1': 0.0992, 'us-east-1': 0.10, 'us-east-2': 0.10, 'us-west-2': 0.10,
        'eu-west-1': 0.110, 'ap-southeast-1': 0.118,
    },
}

# ─── Fallback static EIP prices (USD/hr, ap-south-1) ──────────────────────
_FALLBACK_EIP_PRICES = {
    'ap-south-1': 0.005, 'us-east-1': 0.005, 'us-east-2': 0.005, 'us-west-2': 0.005,
    'eu-west-1': 0.005, 'ap-southeast-1': 0.005,
}

# ─── Fallback static Windows prices (on-demand hourly, ap-south-1) ────────
_FALLBACK_WINDOWS_PRICES = {
    't3.micro': 0.0216, 't3.small': 0.0419, 't3.medium': 0.0700, 't3.large': 0.1283,
    't3.xlarge': 0.2498, 't3.2xlarge': 0.4928,
    'c5.large': 0.172, 'c5.xlarge': 0.344,
    'r5.large': 0.232, 'r5.xlarge': 0.464,
}


# ─── Public API ─────────────────────────────────────────────────────────────

def get_hourly_price(instance_type, region='ap-south-1'):
    """Return the on-demand Linux hourly price (USD) for instance_type in region.

    Sources (in priority order):
      1. Module-level in-memory cache (refreshed every 24h per region)
      2. AWS Price List API (pricing.us-east-1.amazonaws.com)
      3. Built-in fallback table (_FALLBACK_PRICES) if API call fails
    Returns 0.0 if the instance type is unknown in all sources.
    """
    prices = _get_prices(region)
    return prices.get(instance_type, 0.0)


def get_ebs_price(region='ap-south-1', volume_type='gp3'):
    """Return the EBS storage price (USD/GB-Month) for volume_type in region.

    Sources (in priority order):
      1. Module-level in-memory cache (refreshed every 24h per region)
      2. AWS Price List API (pricing.us-east-1.amazonaws.com)
      3. Built-in fallback table (_FALLBACK_EBS_PRICES) if API call fails
    Returns 0.08 if the volume type is unknown in all sources.
    """
    cache_key = f'ebs-{volume_type}-{region}'
    return _get_ebs_prices(region, volume_type, cache_key).get(volume_type, 0.08)


def get_eip_price(region='ap-south-1'):
    """Return the Elastic IP hourly price (USD/hr) for region.

    Sources (in priority order):
      1. Module-level in-memory cache (refreshed every 24h per region)
      2. AWS Price List API (pricing.us-east-1.amazonaws.com)
      3. Built-in fallback table (_FALLBACK_EIP_PRICES) if API call fails
    Returns 0.005 if the region is unknown in all sources.
    """
    cache_key = f'eip-{region}'
    return _get_eip_prices(region, cache_key).get(region, 0.005)


def get_hourly_price_windows(instance_type, region='ap-south-1'):
    """Return the on-demand Windows Server hourly price (USD) for instance_type in region.

    Sources (in priority order):
      1. Module-level in-memory cache (refreshed every 24h per region)
      2. AWS Price List API (pricing.us-east-1.amazonaws.com)
      3. Built-in fallback table (_FALLBACK_WINDOWS_PRICES) if API call fails
    Returns 0.0 if the instance type is unknown in all sources.
    """
    prices = _get_windows_prices(region)
    return prices.get(instance_type, 0.0)


# ─── Internal ────────────────────────────────────────────────────────────────

def _get_prices(region):
    """Return cached prices for region, fetching fresh if cache is stale."""
    entry = _cache.get(region)
    if entry and (time.time() - entry['ts']) < CACHE_TTL:
        return entry['prices']

    try:
        prices = _fetch_from_price_list_api(region)
        _cache[region] = {'prices': prices, 'ts': time.time()}
        logger.info("Pricing: fetched %d prices for %s from Price List API", len(prices), region)
        return prices
    except Exception as exc:
        logger.warning("Pricing: Price List API failed for %s (%s) — using fallback", region, exc)
        # Cache the fallback so we don't hammer the API on every request
        fallback = dict(_FALLBACK_PRICES)
        _cache[region] = {'prices': fallback, 'ts': time.time()}
        return fallback


def _get_ebs_prices(region, volume_type, cache_key):
    """Return cached EBS prices for region, fetching fresh if cache is stale."""
    entry = _cache.get(cache_key)
    if entry and (time.time() - entry['ts']) < CACHE_TTL:
        return entry['prices']

    try:
        prices = _fetch_ebs_price_from_api(region, volume_type)
        _cache[cache_key] = {'prices': prices, 'ts': time.time()}
        logger.info("Pricing: fetched EBS price for %s in %s from Price List API", volume_type, region)
        return prices
    except Exception as exc:
        logger.warning("Pricing: EBS Price List API failed for %s in %s (%s) — using fallback", volume_type, region, exc)
        # Return fallback for this volume type and region
        fallback = {volume_type: _FALLBACK_EBS_PRICES.get(volume_type, {}).get(region, 0.08)}
        _cache[cache_key] = {'prices': fallback, 'ts': time.time()}
        return fallback


def _get_eip_prices(region, cache_key):
    """Return cached EIP prices for region, fetching fresh if cache is stale."""
    entry = _cache.get(cache_key)
    if entry and (time.time() - entry['ts']) < CACHE_TTL:
        return entry['prices']

    try:
        prices = _fetch_eip_price_from_api(region)
        _cache[cache_key] = {'prices': prices, 'ts': time.time()}
        logger.info("Pricing: fetched EIP price for %s from Price List API", region)
        return prices
    except Exception as exc:
        logger.warning("Pricing: EIP Price List API failed for %s (%s) — using fallback", region, exc)
        # Return fallback for this region
        fallback = {region: _FALLBACK_EIP_PRICES.get(region, 0.005)}
        _cache[cache_key] = {'prices': fallback, 'ts': time.time()}
        return fallback


def _get_windows_prices(region):
    """Return cached Windows prices for region, fetching fresh if cache is stale."""
    cache_key = f'windows-{region}'
    entry = _cache.get(cache_key)
    if entry and (time.time() - entry['ts']) < CACHE_TTL:
        return entry['prices']

    try:
        prices = _fetch_windows_price_from_api(region)
        _cache[cache_key] = {'prices': prices, 'ts': time.time()}
        logger.info("Pricing: fetched %d Windows prices for %s from Price List API", len(prices), region)
        return prices
    except Exception as exc:
        logger.warning("Pricing: Windows Price List API failed for %s (%s) — using fallback", region, exc)
        # Cache the fallback so we don't hammer the API on every request
        fallback = dict(_FALLBACK_WINDOWS_PRICES)
        _cache[cache_key] = {'prices': fallback, 'ts': time.time()}
        return fallback


def _fetch_from_price_list_api(region):
    """Call the AWS Price List API and return {instanceType: usd_per_hour} for region."""
    location = REGION_TO_LOCATION.get(region)
    if not location:
        raise ValueError(f"No Price List location mapping for region '{region}'")

    # Pricing API is only available in us-east-1 (and eu-central-1)
    client = boto3.client('pricing', region_name='us-east-1')
    paginator = client.get_paginator('get_products')

    pages = paginator.paginate(
        ServiceCode='AmazonEC2',
        Filters=[
            {'Type': 'TERM_MATCH', 'Field': 'location',        'Value': location},
            {'Type': 'TERM_MATCH', 'Field': 'operatingSystem', 'Value': 'Linux'},
            {'Type': 'TERM_MATCH', 'Field': 'tenancy',         'Value': 'Shared'},
            {'Type': 'TERM_MATCH', 'Field': 'preInstalledSw',  'Value': 'NA'},
            {'Type': 'TERM_MATCH', 'Field': 'capacitystatus',  'Value': 'Used'},
        ],
    )

    prices = {}
    for page in pages:
        for price_str in page.get('PriceList', []):
            try:
                item = json.loads(price_str)
                inst_type = item.get('product', {}).get('attributes', {}).get('instanceType')
                if not inst_type:
                    continue
                on_demand = item.get('terms', {}).get('OnDemand', {})
                term = next(iter(on_demand.values()))
                dim  = next(iter(term['priceDimensions'].values()))
                usd  = float(dim['pricePerUnit']['USD'])
                if usd > 0:
                    prices[inst_type] = usd
            except (KeyError, StopIteration, ValueError, TypeError):
                continue

    if not prices:
        raise RuntimeError(f"Price List API returned no results for region '{region}'")
    return prices


def _fetch_ebs_price_from_api(region, volume_type):
    """Call the AWS Price List API and return {volumeType: usd_per_gb_month} for region."""
    location = REGION_TO_LOCATION.get(region)
    if not location:
        raise ValueError(f"No Price List location mapping for region '{region}'")

    client = boto3.client('pricing', region_name='us-east-1')
    paginator = client.get_paginator('get_products')

    pages = paginator.paginate(
        ServiceCode='AmazonEC2',
        Filters=[
            {'Type': 'TERM_MATCH', 'Field': 'location',        'Value': location},
            {'Type': 'TERM_MATCH', 'Field': 'productFamily',    'Value': 'Storage'},
            {'Type': 'TERM_MATCH', 'Field': 'volumeApiName',    'Value': volume_type},
        ],
    )

    prices = {}
    for page in pages:
        for price_str in page.get('PriceList', []):
            try:
                item = json.loads(price_str)
                vol_type = item.get('product', {}).get('attributes', {}).get('volumeApiName')
                if not vol_type:
                    continue
                on_demand = item.get('terms', {}).get('OnDemand', {})
                term = next(iter(on_demand.values()))
                dim  = next(iter(term['priceDimensions'].values()))
                usd  = float(dim['pricePerUnit']['USD'])
                if usd > 0:
                    prices[vol_type] = usd
            except (KeyError, StopIteration, ValueError, TypeError):
                continue

    if not prices:
        raise RuntimeError(f"Price List API returned no results for EBS {volume_type} in region '{region}'")
    return prices


def _fetch_eip_price_from_api(region):
    """Call the AWS Price List API and return {region: usd_per_hour} for Elastic IP."""
    location = REGION_TO_LOCATION.get(region)
    if not location:
        raise ValueError(f"No Price List location mapping for region '{region}'")

    client = boto3.client('pricing', region_name='us-east-1')
    paginator = client.get_paginator('get_products')

    pages = paginator.paginate(
        ServiceCode='AmazonEC2',
        Filters=[
            {'Type': 'TERM_MATCH', 'Field': 'location', 'Value': location},
            {'Type': 'TERM_MATCH', 'Field': 'group',    'Value': 'ElasticIP:AdditionalAddress'},
        ],
    )

    prices = {}
    for page in pages:
        for price_str in page.get('PriceList', []):
            try:
                item = json.loads(price_str)
                on_demand = item.get('terms', {}).get('OnDemand', {})
                term = next(iter(on_demand.values()))
                dim  = next(iter(term['priceDimensions'].values()))
                usd  = float(dim['pricePerUnit']['USD'])
                if usd > 0:
                    prices[region] = usd
                    break  # Only need one match
            except (KeyError, StopIteration, ValueError, TypeError):
                continue

    if not prices:
        raise RuntimeError(f"Price List API returned no results for EIP in region '{region}'")
    return prices


def _fetch_windows_price_from_api(region):
    """Call the AWS Price List API and return {instanceType: usd_per_hour} for Windows Server."""
    location = REGION_TO_LOCATION.get(region)
    if not location:
        raise ValueError(f"No Price List location mapping for region '{region}'")

    client = boto3.client('pricing', region_name='us-east-1')
    paginator = client.get_paginator('get_products')

    pages = paginator.paginate(
        ServiceCode='AmazonEC2',
        Filters=[
            {'Type': 'TERM_MATCH', 'Field': 'location',        'Value': location},
            {'Type': 'TERM_MATCH', 'Field': 'operatingSystem', 'Value': 'Windows'},
            {'Type': 'TERM_MATCH', 'Field': 'tenancy',         'Value': 'Shared'},
            {'Type': 'TERM_MATCH', 'Field': 'capacitystatus',  'Value': 'Used'},
        ],
    )

    prices = {}
    for page in pages:
        for price_str in page.get('PriceList', []):
            try:
                item = json.loads(price_str)
                inst_type = item.get('product', {}).get('attributes', {}).get('instanceType')
                if not inst_type:
                    continue
                on_demand = item.get('terms', {}).get('OnDemand', {})
                term = next(iter(on_demand.values()))
                dim  = next(iter(term['priceDimensions'].values()))
                usd  = float(dim['pricePerUnit']['USD'])
                if usd > 0:
                    prices[inst_type] = usd
            except (KeyError, StopIteration, ValueError, TypeError):
                continue

    if not prices:
        raise RuntimeError(f"Price List API returned no results for Windows in region '{region}'")
    return prices
